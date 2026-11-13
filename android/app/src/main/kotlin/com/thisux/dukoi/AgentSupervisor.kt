package com.thisux.dukoi

import android.content.Context
import android.os.Build
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

/**
 * Keeps one process alive: the agent (agent.mjs on the bundled Node).
 * The agent runs the admin API and looks after apps; this only makes sure the
 * agent itself is always running.
 *
 * A kill (SIGKILL, usually Android) restarts at once. Crashes back off 1, 2, 4,
 * 8, 16, then 30 seconds; a run of 60 seconds resets that.
 */
object AgentSupervisor {
  const val ADMIN_PORT = 7070
  private const val HEALTHY_AFTER_MS = 60_000L
  private const val MAX_BACKOFF_MS = 30_000L

  enum class State { STOPPED, STARTING, RUNNING, RESTARTING, FAILED }

  data class Status(
    val state: State = State.STOPPED,
    val pid: Int? = null,
    val restarts: Int = 0,
    val lastExit: String? = null,
    val problem: String? = null,
  )

  private val _status = MutableStateFlow(Status())
  val status: StateFlow<Status> = _status

  @Volatile private var wanted = false
  @Volatile private var process: Process? = null
  private var thread: Thread? = null

  fun home(context: Context) = File(context.filesDir, "dukoi")

  /** The chip, for benchmarks. Android 12 and up say it; older phones don't. */
  private fun chip(): String? =
    if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL.takeIf { it.isNotBlank() && it != Build.UNKNOWN } else null
  fun logFile(context: Context) = File(home(context), "agent.log")

  @Synchronized
  fun start(context: Context) {
    if (wanted) return
    wanted = true
    val app = context.applicationContext
    thread = Thread({ loop(app) }, "agent-supervisor").apply { isDaemon = true; start() }
  }

  @Synchronized
  fun stop() {
    wanted = false
    process?.destroy()
    thread?.interrupt()
    thread = null
  }

  private fun loop(context: Context) {
    val node = File(context.applicationInfo.nativeLibraryDir, "libnode.so")
    if (!node.exists()) return fail("Node is missing from this build. Run scripts/prepare-android.sh, then rebuild.")
    val script = runCatching { installAgent(context) }.getOrElse {
      return fail("Couldn't unpack the agent: ${it.message}")
    }
    // Templates are optional: without them the phone just doesn't offer Try a template.
    val templates = runCatching { installTemplates(context) }.getOrNull()
    // Postgres is optional too: without it the phone just can't make Postgres databases.
    val postgres = runCatching { installPostgres(context) }.getOrNull()
    val home = home(context).apply { mkdirs() }
    val log = logFile(context)
    var crashes = 0
    var restarts = 0

    while (wanted) {
      _status.value = _status.value.copy(state = if (restarts == 0) State.STARTING else State.RESTARTING, restarts = restarts)
      val startedAt = System.currentTimeMillis()
      val builder = ProcessBuilder(node.absolutePath, script.absolutePath)
        .directory(home)
        .redirectErrorStream(true)
        .redirectOutput(ProcessBuilder.Redirect.appendTo(log))
      builder.environment().apply {
        put("DUKOI_HOME", home.absolutePath)
        File(context.applicationInfo.nativeLibraryDir, "libcloudflared.so").takeIf { it.exists() }
          ?.let { put("DUKOI_CLOUDFLARED", it.absolutePath) }
        File(context.applicationInfo.nativeLibraryDir, "libvalkey.so").takeIf { it.exists() }
          ?.let { put("DUKOI_VALKEY", it.absolutePath) }
        postgres?.let { put("DUKOI_POSTGRES", it.absolutePath) }
        put("DUKOI_PHONE_NAME", phoneName())
        put("DUKOI_PHONE_MODEL", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("DUKOI_ANDROID", Build.VERSION.RELEASE)
        put("DUKOI_PHONE_MAKER", Build.MANUFACTURER.replaceFirstChar { it.uppercase() })
        chip()?.let { put("DUKOI_PHONE_CHIP", it) }
        templates?.let { put("DUKOI_TEMPLATES", it.absolutePath) }
        put("HOME", home.absolutePath)
        put("TMPDIR", context.cacheDir.absolutePath)
      }
      val started = runCatching { builder.start() }.getOrElse { return fail("Couldn't start the agent: ${it.message}") }
      process = started
      _status.value = _status.value.copy(state = State.RUNNING, pid = pidOf(started), problem = null)

      val code = try { started.waitFor() } catch (_: InterruptedException) { started.destroy(); break }
      process = null
      val ranMs = System.currentTimeMillis() - startedAt
      val exit = describeExit(code)
      _status.value = _status.value.copy(pid = null, lastExit = exit)
      note(log, "agent $exit after ${ranMs / 1000}s")
      if (!wanted) break

      if (ranMs >= HEALTHY_AFTER_MS) crashes = 0
      val killed = code == 137
      val waitMs = if (killed) 0L else {
        crashes++
        min(MAX_BACKOFF_MS, 1000L shl (crashes - 1).coerceAtMost(5))
      }
      restarts++
      _status.value = _status.value.copy(state = State.RESTARTING, restarts = restarts)
      try { Thread.sleep(waitMs) } catch (_: InterruptedException) { break }
    }
    _status.value = _status.value.copy(state = State.STOPPED, pid = null)
  }

  /** Copies agent.mjs out of the APK when this build's copy differs. */
  private fun installAgent(context: Context): File {
    val bytes = context.assets.open("agent/agent.mjs").use { it.readBytes() }
    val dir = File(context.filesDir, "agent").apply { mkdirs() }
    val target = File(dir, "agent.mjs")
    if (!target.exists() || !target.readBytes().contentEquals(bytes)) {
      val tmp = File(dir, "agent.mjs.tmp")
      tmp.writeBytes(bytes)
      tmp.renameTo(target)
    }
    return target
  }

  /** Copies the template archives (assets/templates/<id>.tgz) out of the APK when they differ. */
  private fun installTemplates(context: Context): File? {
    val names = context.assets.list("templates")?.filter { it.endsWith(".tgz") }.orEmpty()
    if (names.isEmpty()) return null
    val dir = File(context.filesDir, "templates").apply { mkdirs() }
    for (name in names) {
      val bytes = context.assets.open("templates/$name").use { it.readBytes() }
      val target = File(dir, name)
      if (target.exists() && target.readBytes().contentEquals(bytes)) continue
      val tmp = File(dir, "$name.tmp")
      tmp.writeBytes(bytes)
      tmp.renameTo(target)
    }
    // A template dropped from this build shouldn't be offered any more.
    dir.listFiles()?.filter { it.name !in names }?.forEach { it.delete() }
    return dir
  }

  /**
   * Copies Postgres (assets/postgres: postgres.mjs and PGlite's .wasm and .data
   * files, about 16 MB) out of the APK. Only after an install or update, so a
   * normal start doesn't read 16 MB. Returns postgres.mjs, or null if this
   * build has no Postgres.
   */
  private fun installPostgres(context: Context): File? {
    val names = context.assets.list("postgres").orEmpty()
    if ("postgres.mjs" !in names) return null
    val dir = File(context.filesDir, "postgres").apply { mkdirs() }
    val stamp = File(dir, ".installed")
    val build = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
    if (stamp.exists() && stamp.readText() == build && names.all { File(dir, it).exists() }) {
      return File(dir, "postgres.mjs")
    }
    for (name in names) {
      val tmp = File(dir, "$name.tmp")
      context.assets.open("postgres/$name").use { input -> tmp.outputStream().use { input.copyTo(it) } }
      tmp.renameTo(File(dir, name))
    }
    stamp.writeText(build)
    return File(dir, "postgres.mjs")
  }

  fun agentHash(context: Context): String = runCatching {
    val bytes = context.assets.open("agent/agent.mjs").use { it.readBytes() }
    MessageDigest.getInstance("SHA-256").digest(bytes).take(4).joinToString("") { "%02x".format(it) }
  }.getOrDefault("missing")

  /** This phone's name as the agent reports it, e.g. "a024" */
  fun phoneName(): String {
    val model = Build.MODEL.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "-").trim('-')
    return model.ifEmpty { "phone" }
  }

  private fun fail(message: String) {
    wanted = false
    _status.value = _status.value.copy(state = State.FAILED, problem = message)
  }

  private fun describeExit(code: Int): String = when {
    code == 0 -> "exited cleanly"
    code == 137 -> "was killed (SIGKILL, usually Android)"
    code == 143 -> "was stopped (SIGTERM)"
    code > 128 -> "was killed by signal ${code - 128}"
    else -> "crashed with code $code"
  }

  /** Process.pid() needs API 33, so read the field the platform sets. */
  private fun pidOf(p: Process): Int? = runCatching {
    p.javaClass.getDeclaredField("pid").apply { isAccessible = true }.getInt(p)
  }.getOrNull()

  private val timeFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)

  @Synchronized
  private fun note(log: File, text: String) {
    log.appendText("${timeFormat.format(Date())} [supervisor] $text\n")
  }
}
