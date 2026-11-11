package com.thisux.droidhost

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.thisux.droidhost.ui.AppScreen
import com.thisux.droidhost.ui.BatteryCareScreen
import com.thisux.droidhost.ui.DisconnectCloudflareSheet
import com.thisux.droidhost.ui.Durations
import com.thisux.droidhost.ui.EaseOut
import com.thisux.droidhost.ui.LocalToast
import com.thisux.droidhost.ui.Toast
import com.thisux.droidhost.ui.ToastHost
import com.thisux.droidhost.ui.HomeScreen
import com.thisux.droidhost.ui.OnboardingStep
import com.thisux.droidhost.ui.PairScreen
import com.thisux.droidhost.ui.PairingRequestScreen
import com.thisux.droidhost.ui.PermissionScreen
import com.thisux.droidhost.ui.Problem
import com.thisux.droidhost.ui.SettingsScreen
import com.thisux.droidhost.ui.WelcomeScreen
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.DroidHostTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Dark icons on the light canvas.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(Canvas.toArgb(), Canvas.toArgb()),
      navigationBarStyle = SystemBarStyle.light(Canvas.toArgb(), Canvas.toArgb()),
    )
    if (AgentService.isWanted(this)) AgentService.start(this)
    setContent {
      DroidHostTheme {
        val toast = remember { Toast() }
        CompositionLocalProvider(LocalToast provides toast) {
          Box(Modifier.fillMaxSize().background(Canvas)) {
            App()
            ToastHost(toast)
          }
        }
      }
    }
  }
}

private sealed interface Screen {
  data class Onboarding(val step: OnboardingStep) : Screen
  data object Home : Screen
  data class App(val name: String) : Screen
  data object Settings : Screen
  data object BatteryCare : Screen
}

private const val PREFS = "droidhost"
private const val KEY_ONBOARDED = "onboarded"

@Composable
private fun App() {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val toast = LocalToast.current
  val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
  val supervisor by AgentSupervisor.status.collectAsStateWithLifecycle()

  var screen by remember {
    mutableStateOf<Screen>(if (prefs.getBoolean(KEY_ONBOARDED, false)) Screen.Home else Screen.Onboarding(OnboardingStep.WELCOME))
  }
  var apps by remember { mutableStateOf<List<AppInfo>?>(null) }
  var vitals by remember { mutableStateOf(Vitals(null, null, null)) }
  var care by remember { mutableStateOf(Battery.care(context)) }
  var pending by remember { mutableStateOf(emptyList<PairingRequest>()) }
  var computers by remember { mutableStateOf(emptyList<PairedComputer>()) }
  val firstSeen = remember { mutableStateMapOf<String, Long>() }
  var refresh by remember { mutableIntStateOf(0) }
  // Bumped whenever the app comes back to the front, e.g. from a settings screen.
  var resumed by remember { mutableIntStateOf(0) }
  LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { resumed++ }

  // Everything on screen is read from the agent every 1.5 s.
  LaunchedEffect(refresh) {
    while (true) {
      withContext(Dispatchers.IO) {
        apps = Phone.apps() ?: apps
        vitals = Phone.vitals(context)
        care = Battery.care(context)
        Pairing.load()?.let { (p, c) -> pending = p; computers = c }
      }
      pending.forEach { firstSeen.putIfAbsent(it.publicKey, System.currentTimeMillis()) }
      delay(1500)
    }
  }

  fun finishOnboarding() {
    prefs.edit().putBoolean(KEY_ONBOARDED, true).apply()
    screen = Screen.Home
  }

  // The next onboarding screen: only steps Android hasn't confirmed, then Pair if no computer is paired.
  fun next(after: OnboardingStep) {
    val steps = OnboardingStep.entries.filter { it.ordinal > after.ordinal }
    val step = steps.firstOrNull { !it.done(context) && (it != OnboardingStep.PAIR || computers.isEmpty()) }
    if (step == null) finishOnboarding() else screen = Screen.Onboarding(step)
  }

  // A step finished in Android's settings moves on by itself.
  LaunchedEffect(resumed, computers) {
    val current = (screen as? Screen.Onboarding)?.step ?: return@LaunchedEffect
    if (current != OnboardingStep.WELCOME && current.done(context)) next(current)
    if (current == OnboardingStep.PAIR && computers.isNotEmpty()) finishOnboarding()
  }

  val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) next(OnboardingStep.BACKGROUND) else openNotificationSettings(context)
  }

  // Every action confirms itself: a snackbar while it runs (if it takes a moment),
  // then what happened, or the agent's own words if it failed.
  fun control(name: String, action: String) {
    val (doing, done) = when (action) {
      "start" -> "Starting $name" to "Started $name"
      "stop" -> null to "Stopped $name"
      "restart" -> "Restarting $name" to "Restarted $name"
      else -> "Rolling back $name" to "Rolled back $name"
    }
    doing?.let { toast.show(it) }
    scope.launch {
      val problem = withContext(Dispatchers.IO) { Phone.control(name, action) }
      if (problem == null) toast.show(done) else toast.show(problem, error = true)
      refresh++
    }
  }

  fun stopAll() {
    val names = apps?.map { it.name }.orEmpty()
    toast.show("Stopping all apps")
    scope.launch {
      val failed = withContext(Dispatchers.IO) { names.count { Phone.control(it, "stop") != null } }
      if (failed == 0) toast.show("Stopped all apps")
      else toast.show("Couldn’t stop $failed of ${names.size} apps", error = true)
      refresh++
    }
  }

  // A computer asking to pair takes over the screen, wherever you are.
  val shown: Any = pending.firstOrNull() ?: screen
  AnimatedContent(targetState = shown, transitionSpec = { transition(initialState, targetState) }, label = "screen") { target ->
  if (target is PairingRequest) {
    PairingRequestScreen(
      request = target,
      firstSeenAt = firstSeen[target.publicKey] ?: System.currentTimeMillis(),
      onPair = { decide(scope, context, target, true); pending = pending - target; refresh++ },
      onDeny = { decide(scope, context, target, false); pending = pending - target },
    )
    return@AnimatedContent
  }

  when (val s = target as Screen) {
    is Screen.Onboarding -> when (s.step) {
      OnboardingStep.WELCOME -> WelcomeScreen { next(OnboardingStep.WELCOME) }
      OnboardingStep.PAIR -> PairScreen(onLater = ::finishOnboarding)
      else -> PermissionScreen(
        step = s.step,
        onAction = {
          when (s.step) {
            OnboardingStep.BACKGROUND ->
              if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) else next(s.step)
            OnboardingStep.BATTERY_LIMITS -> requestBatteryLimitsOff(context)
            else -> openAppSettings(context)
          }
        },
        onSkip = { next(s.step) },
      )
    }

    Screen.Home -> HomeScreen(
      apps = apps,
      vitals = vitals,
      problem = problem(context, supervisor),
      onFix = {
        if (supervisor.state == AgentSupervisor.State.FAILED) {
          AgentService.stop(context); AgentService.start(context)
        } else {
          requestBatteryLimitsOff(context)
        }
      },
      onOpenApp = { screen = Screen.App(it) },
      onSettings = { screen = Screen.Settings },
    )

    is Screen.App -> {
      BackHandler { screen = Screen.Home }
      val app = apps?.firstOrNull { it.name == s.name }
      var logs by remember(s.name) { mutableStateOf(emptyList<LogLine>()) }
      LaunchedEffect(s.name, refresh) {
        while (true) {
          logs = withContext(Dispatchers.IO) { Phone.logs(s.name) }
          delay(1500)
        }
      }
      if (app == null) {
        // Removed from the computer while open.
        LaunchedEffect(apps) { if (apps != null) screen = Screen.Home }
      } else {
        AppScreen(app, logs, onBack = { screen = Screen.Home }, onAction = { control(app.name, it) })
      }
    }

    Screen.Settings -> {
      BackHandler { screen = Screen.Home }
      var cloudflare by remember { mutableStateOf<DomainStatus?>(null) }
      var disconnecting by remember { mutableStateOf(false) }
      var reload by remember { mutableIntStateOf(0) }
      LaunchedEffect(reload) { cloudflare = withContext(Dispatchers.IO) { Phone.domainStatus() } }
      cloudflare?.takeIf { disconnecting }?.let { status ->
        DisconnectCloudflareSheet(status, onDismiss = { disconnecting = false }, onDone = { disconnecting = false; reload++; refresh++ })
      }
      SettingsScreen(
        computers = computers,
        phoneName = AgentSupervisor.phoneName(),
        address = Phone.wifiIp(context),
        setupDone = Setup.done(context),
        chargeLimit = care.limit,
        cloudflare = cloudflare,
        hasApps = !apps.isNullOrEmpty(),
        onBack = { screen = Screen.Home },
        onRemove = { pc ->
          scope.launch(Dispatchers.IO) { Pairing.remove(pc.publicKey) }
          computers = computers - pc
        },
        onFinishSetup = { next(OnboardingStep.WELCOME) },
        onBatteryCare = { screen = Screen.BatteryCare },
        onDisconnectCloudflare = { disconnecting = true },
        onStopAll = ::stopAll,
      )
    }

    Screen.BatteryCare -> {
      BackHandler { screen = Screen.Settings }
      BatteryCareScreen(care, onBack = { screen = Screen.Settings }, onTurnOn = { Battery.openSettings(context) })
    }
  }
  }
}

/** How deep a screen sits, so moving deeper slides in from the right and going back slides from the left. */
private fun depth(s: Any): Int = when (s) {
  is Screen.Onboarding -> s.step.ordinal
  Screen.Home -> 10
  is Screen.App, Screen.Settings -> 11
  Screen.BatteryCare -> 12
  else -> 20
}

private fun transition(from: Any, to: Any): ContentTransform {
  // A pairing request rises from the bottom and sinks back down.
  if (to is PairingRequest || from is PairingRequest) {
    val rising = to is PairingRequest
    return (slideInVertically(tween(Durations.SCREEN_IN, easing = EaseOut)) { if (rising) it / 8 else 0 } + fadeIn(tween(Durations.SCREEN_IN, easing = EaseOut)))
      .togetherWith(slideOutVertically(tween(Durations.SCREEN_OUT, easing = EaseOut)) { if (rising) 0 else it / 8 } + fadeOut(tween(Durations.SCREEN_OUT)))
  }
  val forward = depth(to) >= depth(from)
  // Enter with a strong ease-out; leave faster than you arrive.
  return (slideInHorizontally(tween(Durations.SCREEN_IN, easing = EaseOut)) { if (forward) it / 5 else -it / 5 } + fadeIn(tween(Durations.SCREEN_IN, easing = EaseOut)))
    .togetherWith(slideOutHorizontally(tween(Durations.SCREEN_OUT, easing = EaseOut)) { if (forward) -it / 10 else it / 10 } + fadeOut(tween(Durations.SCREEN_OUT)))
}

private fun OnboardingStep.done(context: Context) = when (this) {
  OnboardingStep.WELCOME -> false
  OnboardingStep.BACKGROUND -> Setup.notifications(context)
  OnboardingStep.BATTERY_LIMITS -> Setup.batteryLimitsOff(context)
  OnboardingStep.UNRESTRICTED -> Setup.unrestricted(context)
  OnboardingStep.PAIR -> false
}

/** The home screen says plainly when apps can't run, and offers the fix. */
private fun problem(context: Context, supervisor: AgentSupervisor.Status): Problem? = when {
  supervisor.state == AgentSupervisor.State.FAILED ->
    Problem(supervisor.problem ?: "DroidHost stopped", "Try again")
  supervisor.restarts >= 2 && !Setup.batteryLimitsOff(context) ->
    Problem("Android keeps stopping DroidHost", "Fix battery settings")
  else -> null
}

private fun decide(scope: kotlinx.coroutines.CoroutineScope, context: Context, req: PairingRequest, approve: Boolean) {
  scope.launch(Dispatchers.IO) {
    Pairing.decide(req.publicKey, approve)
    Pairing.clearNotification(context, req.publicKey)
  }
}

@SuppressLint("BatteryLife")
private fun requestBatteryLimitsOff(context: Context) {
  context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
}

/** Battery → Unrestricted lives on the app's own settings page. */
private fun openAppSettings(context: Context) {
  context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
}

private fun openNotificationSettings(context: Context) {
  context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
}
