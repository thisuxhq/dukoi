package com.thisux.droidhost

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

  fun home(context: Context) = File(context.filesDir, "droidhost")
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
        put("DROIDHOST_HOME", home.absolutePath)
        put("DROIDHOST_PHONE_NAME", phoneName())
        put("DROIDHOST_PHONE_MODEL", "${Build.MANUFACTURER} ${Build.MODEL}")
        put("DROIDHOST_ANDROID", Build.VERSION.RELEASE)
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

  fun agentHash(context: Context): String = runCatching {
    val bytes = context.assets.open("agent/agent.mjs").use { it.readBytes() }
    MessageDigest.getInstance("SHA-256").digest(bytes).take(4).joinToString("") { "%02x".format(it) }
  }.getOrDefault("missing")

  private fun phoneName(): String {
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
