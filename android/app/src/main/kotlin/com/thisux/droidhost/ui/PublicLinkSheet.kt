package com.thisux.droidhost.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.AppInfo
import com.thisux.droidhost.Phone
import com.thisux.droidhost.ui.theme.Border
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Faint
import com.thisux.droidhost.ui.theme.Ink
import com.thisux.droidhost.ui.theme.Muted
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class Mode { OFF, QUICK, DOMAIN }

/**
 * Choose how an app is reached from the internet: not at all, a quick link
 * (instant, but it changes when the tunnel restarts), or your own domain (never
 * changes). The first domain connects the phone to Cloudflare in a browser tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PublicLinkSheet(app: AppInfo, onDismiss: () -> Unit) {
  val context = LocalContext.current
  val toast = LocalToast.current
  val scope = rememberCoroutineScope()
  val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)

  val current = when {
    app.domain != null -> Mode.DOMAIN
    app.publicUrl != null -> Mode.QUICK
    else -> Mode.OFF
  }
  var picked by remember { mutableStateOf(current) }
  var zone by remember { mutableStateOf<String?>(null) }
  var hostname by remember { mutableStateOf(app.domain ?: "") }
  var busy by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    zone = withContext(Dispatchers.IO) { Phone.domainStatus() }?.zone
    if (hostname.isEmpty() && zone != null) hostname = "${app.name}.$zone"
  }

  fun close() = scope.launch { state.hide() }.invokeOnCompletion { onDismiss() }

  fun finish(error: String?, done: String) {
    busy = null
    if (error == null) { toast.show(done); close() } else toast.show(error, error = true)
  }

  fun goOff() {
    busy = "Turning off"
    scope.launch { finish(withContext(Dispatchers.IO) { Phone.makePrivate(app.name) }.error, "${app.name} is private") }
  }

  fun goQuick() {
    busy = "Asking Cloudflare"
    scope.launch {
      if (current == Mode.DOMAIN) withContext(Dispatchers.IO) { Phone.makePrivate(app.name) }
      finish(withContext(Dispatchers.IO) { Phone.quickLink(app.name) }.error, "Quick link ready")
    }
  }

  fun goDomain() {
    val name = hostname.trim()
    if (name.isEmpty()) return
    scope.launch {
      busy = "Pointing $name"
      var result = withContext(Dispatchers.IO) { Phone.setDomain(app.name, name) }
      if (result.code == "NEEDS_LOGIN") {
        // First domain on this phone: connect it to Cloudflare, then try again.
        busy = "Waiting for Cloudflare"
        val (status, problem) = withContext(Dispatchers.IO) { Phone.startDomainLogin() }
        if (status == null) return@launch finish(problem, "")
        status.loginUrl?.let { openInTab(context, it) }
        val deadline = System.currentTimeMillis() + 10 * 60_000
        var loggedIn = status.loggedIn
        while (!loggedIn && System.currentTimeMillis() < deadline) {
          delay(2000)
          loggedIn = withContext(Dispatchers.IO) { Phone.domainStatus() }?.loggedIn == true
        }
        if (!loggedIn) return@launch finish("Cloudflare login wasn’t finished. Try again.", "")
        busy = "Pointing $name"
        result = withContext(Dispatchers.IO) { Phone.setDomain(app.name, name) }
      }
      finish(result.error, "${result.publicUrl?.removePrefix("https://") ?: name} is live")
    }
  }

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = state,
    containerColor = Canvas,
    shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
    dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 4.dp).background(Faint)) },
  ) {
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Gutter).padding(bottom = 24.dp)) {
      Spacer(Modifier.height(16.dp))
      Text("Public link", style = Styles.Section)
      Spacer(Modifier.height(16.dp))
      Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Option("Off", picked == Mode.OFF) { picked = Mode.OFF }
        Option("Quick link", picked == Mode.QUICK) { picked = Mode.QUICK }
        Option("Your domain", picked == Mode.DOMAIN) { picked = Mode.DOMAIN }
      }

      AnimatedVisibility(
        visible = picked == Mode.DOMAIN,
        enter = expandVertically(tween(Durations.SMALL, easing = EaseOut)) + fadeIn(tween(Durations.SMALL)),
        exit = shrinkVertically(tween(140, easing = EaseOut)) + fadeOut(tween(100)),
      ) {
        Column {
          Spacer(Modifier.height(12.dp))
          BasicTextField(
            value = hostname,
            onValueChange = { hostname = it },
            singleLine = true,
            textStyle = Styles.Log.copy(fontSize = 15.sp, lineHeight = 20.sp, color = Ink),
            cursorBrush = SolidColor(Violet),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onDone = { goDomain() }),
            decorationBox = { inner ->
              Box(
                Modifier.fillMaxWidth().background(Card).border(1.dp, Border).padding(horizontal = 16.dp, vertical = 15.dp),
              ) {
                if (hostname.isEmpty()) Text("api.example.com", style = Styles.Log.copy(fontSize = 15.sp, color = Muted))
                inner()
              }
            },
          )
        }
      }

      Spacer(Modifier.height(20.dp))
      val unchanged = picked == current && (picked != Mode.DOMAIN || hostname.trim() == app.domain)
      val label = busy ?: when {
        unchanged -> "Done"
        picked == Mode.OFF -> "Turn off"
        picked == Mode.QUICK -> "Get quick link"
        else -> "Use domain"
      }
      PrimaryButton(label) {
        if (busy != null) return@PrimaryButton
        when {
          picked == current && picked != Mode.DOMAIN -> close()
          picked == Mode.OFF -> goOff()
          picked == Mode.QUICK -> goQuick()
          picked == Mode.DOMAIN && hostname.trim() == app.domain -> close()
          else -> goDomain()
        }
      }
    }
  }
}

@Composable
private fun Option(label: String, selected: Boolean, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().background(Card).tap(onClick).padding(horizontal = 16.dp, vertical = 16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(label, style = Styles.Body, modifier = Modifier.weight(1f))
    // The dot grows in from 0.6, never from nothing.
    val dot by animateFloatAsState(if (selected) 1f else 0f, tween(Durations.SMALL, easing = EaseOut), label = "radio")
    Box(Modifier.size(20.dp).border(1.5.dp, if (selected) Violet else Border, CircleShape), contentAlignment = Alignment.Center) {
      Box(
        Modifier.size(10.dp)
          .graphicsLayer { alpha = dot; scaleX = 0.6f + 0.4f * dot; scaleY = 0.6f + 0.4f * dot }
          .background(Violet, CircleShape),
      )
    }
  }
}
