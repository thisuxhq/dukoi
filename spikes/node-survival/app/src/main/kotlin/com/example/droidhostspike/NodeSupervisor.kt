package com.example.droidhostspike

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Starts the bundled Node binary, waits for it to exit, and starts it again.
 *
 * This is the smallest version of the DroidHost process manager. It answers two
 * spike questions: does Node run from nativeLibraryDir, and does it come back
 * when Android or a crash stops it?
 */
object NodeSupervisor {
  const val PORT = 3000
  private const val HEALTHY_AFTER_MS = 60_000L
  private const val MAX_BACKOFF_MS = 30_000L

  enum class State { STOPPED, STARTING, RUNNING, RESTARTING, FAILED }

  data class Status(
    val state: State = State.STOPPED,
    val pid: Int? = null,
    val nodeVersion: String? = null,
    val restarts: Int = 0,
    val runningSince: Long? = null,
    val lastExit: String? = null,
    val problem: String? = null,
  )

  private val _status = MutableStateFlow(Status())
  val status: StateFlow<Status> = _status

  @Volatile private var wanted = false
  @Volatile private var process: Process? = null
  private var thread: Thread? = null

  @Synchronized
  fun start(context: Context) {
    if (wanted) return
    wanted = true
    val appContext = context.applicationContext
    thread = Thread({ superviseLoop(appContext) }, "node-supervisor").apply {
      isDaemon = true
      start()
    }
  }

  @Synchronized
  fun stop() {
    wanted = false
    process?.destroy()
    thread?.interrupt()
    thread = null
  }

  fun eventsFile(context: Context) = File(context.filesDir, "logs/events.log")
  fun serverLogFile(context: Context) = File(context.filesDir, "logs/server.log")

  private fun superviseLoop(context: Context) {
    val node = File(context.applicationInfo.nativeLibraryDir, "libnode.so")
    if (!node.exists()) {
      fail(context, "Node binary is missing. Run scripts/install-node.sh, then rebuild.")
      return
    }

    val version = runCatching { readNodeVersion(node) }.getOrElse {
      fail(context, "Node is bundled but won't run: ${it.message}")
      return
    }
    _status.value = _status.value.copy(nodeVersion = version, problem = null)
    logEvent(context, "node $version found at ${node.absolutePath}")

    val appDir = File(context.filesDir, "app").apply { mkdirs() }
    val dataDir = File(context.filesDir, "data").apply { mkdirs() }
    val script = File(appDir, "server.js")
    context.assets.open("server.js").use { input -> script.outputStream().use { input.copyTo(it) } }

    val serverLog = serverLogFile(context).apply { parentFile?.mkdirs() }
    val pidFile = File(context.filesDir, "node.pid")
    killLeftoverNode(context, pidFile)
    var quickFailures = 0
    var restarts = 0

    while (wanted) {
      _status.value = _status.value.copy(state = State.STARTING, restarts = restarts)
      val startedAt = System.currentTimeMillis()

      val builder = ProcessBuilder(node.absolutePath, script.absolutePath)
        .directory(appDir)
        .redirectErrorStream(true)
        .redirectOutput(ProcessBuilder.Redirect.appendTo(serverLog))
      builder.environment().apply {
        put("PORT", PORT.toString())
        put("DATA_DIR", dataDir.absolutePath)
        put("HOME", context.filesDir.absolutePath)
        put("TMPDIR", context.cacheDir.absolutePath)
        put("NODE_ENV", "production")
      }

      val started = runCatching { builder.start() }.getOrElse {
        fail(context, "Couldn't start Node: ${it.message}")
        return
      }
      process = started
      val pid = pidOf(started)
      pid?.let { pidFile.writeText(it.toString()) }
      _status.value = _status.value.copy(state = State.RUNNING, pid = pid, runningSince = startedAt)
      logEvent(context, "started pid=$pid")

      val exitCode = try {
        started.waitFor()
      } catch (_: InterruptedException) {
        started.destroy()
        break
      }
      process = null

      val uptimeMs = System.currentTimeMillis() - startedAt
      val reason = describeExit(exitCode)
      _status.value = _status.value.copy(pid = null, runningSince = null, lastExit = "$reason after ${formatDuration(uptimeMs)}")
      logEvent(context, "exited code=$exitCode ($reason) uptime=${formatDuration(uptimeMs)}")

      if (!wanted) break

      // Backoff: 1s, 2s, 4s, 8s, 16s, then every 30s. A run of 60s or more resets it.
      quickFailures = if (uptimeMs >= HEALTHY_AFTER_MS) 1 else quickFailures + 1
      val waitMs = min(MAX_BACKOFF_MS, 1000L shl (quickFailures - 1).coerceAtMost(5))
      restarts++
      _status.value = _status.value.copy(
        state = if (quickFailures > 5) State.FAILED else State.RESTARTING,
        restarts = restarts,
      )
      logEvent(context, "restarting in ${waitMs / 1000}s (restart #$restarts)")
      try {
        Thread.sleep(waitMs)
      } catch (_: InterruptedException) {
        break
      }
    }

    _status.value = _status.value.copy(state = State.STOPPED, pid = null, runningSince = null)
    logEvent(context, "supervisor stopped")
  }

  /**
   * If Android killed our app process, the Node child can outlive it and keep
   * port 3000. Stop that orphan so the new one can bind.
   */
  private fun killLeftoverNode(context: Context, pidFile: File) {
    val pid = pidFile.takeIf { it.exists() }?.readText()?.trim()?.toIntOrNull() ?: return
    val cmdline = runCatching { File("/proc/$pid/cmdline").readText() }.getOrNull()
    if (cmdline != null && cmdline.contains("libnode.so")) {
      android.os.Process.killProcess(pid)
      logEvent(context, "stopped leftover node pid=$pid from an earlier run")
      Thread.sleep(500)
    }
    pidFile.delete()
  }

  private fun readNodeVersion(node: File): String {
    val probe = ProcessBuilder(node.absolutePath, "--version").redirectErrorStream(true).start()
    if (!probe.waitFor(10, TimeUnit.SECONDS)) {
      probe.destroyForcibly()
      error("node --version timed out")
    }
    val output = probe.inputStream.bufferedReader().readText().trim()
    if (probe.exitValue() != 0) error("exit ${probe.exitValue()}: $output")
    return output
  }

  private fun fail(context: Context, message: String) {
    wanted = false
    _status.value = _status.value.copy(state = State.FAILED, problem = message)
    logEvent(context, "problem: $message")
  }

  /** Java reports a process killed by signal N as exit code 128 + N. */
  private fun describeExit(code: Int): String = when {
    code == 0 -> "exited cleanly"
    code == 137 -> "killed (SIGKILL, often Android or a kill -9)"
    code == 143 -> "terminated (SIGTERM)"
    code > 128 -> "killed by signal ${code - 128}"
    else -> "crashed with code $code"
  }

  /** Process.pid() needs API 33, so read the field the platform sets. */
  private fun pidOf(process: Process): Int? = runCatching {
    val field = process.javaClass.getDeclaredField("pid")
    field.isAccessible = true
    field.getInt(process)
  }.getOrNull()

  fun formatDuration(ms: Long): String {
    val s = ms / 1000
    return when {
      s < 60 -> "${s}s"
      s < 3600 -> "${s / 60}m ${s % 60}s"
      else -> "${s / 3600}h ${(s % 3600) / 60}m"
    }
  }

  private val timeFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

  @Synchronized
  fun logEvent(context: Context, message: String) {
    val file = eventsFile(context).apply { parentFile?.mkdirs() }
    file.appendText("${timeFormat.format(Date())}  $message\n")
  }
}
