package com.thisux.droidhost.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.Pairing
import com.thisux.droidhost.PairingRequest
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Ink
import com.thisux.droidhost.ui.theme.Lavender
import com.thisux.droidhost.ui.theme.Styles
import com.thisux.droidhost.ui.theme.Violet
import kotlinx.coroutines.delay

/** Same as the agent: a pairing request lasts two minutes. */
private const val PAIR_TIMEOUT_MS = 2 * 60 * 1000L

@Composable
fun PairingRequestScreen(request: PairingRequest, firstSeenAt: Long, onPair: () -> Unit, onDeny: () -> Unit) {
  var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
  LaunchedEffect(Unit) { while (true) { delay(1000); now = System.currentTimeMillis() } }
  val left = ((PAIR_TIMEOUT_MS - (now - firstSeenAt)) / 1000).coerceAtLeast(0)

  Column(Modifier.fillMaxSize().background(Canvas).systemBarsPadding().padding(horizontal = Gutter)) {
    Spacer(Modifier.weight(1f))
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
      Box(Modifier.size(72.dp).background(Lavender), contentAlignment = Alignment.Center) { Icon("laptop", 32.dp, Violet) }
      Text("Pair ${request.name}?", style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp), textAlign = TextAlign.Center)
    }
    Spacer(Modifier.height(28.dp))
    Box(Modifier.fillMaxWidth().height(112.dp).background(Card), contentAlignment = Alignment.Center) {
      Text(
        Pairing.formatCode(request.code),
        style = Styles.Code.copy(fontSize = 52.sp, lineHeight = 60.sp, letterSpacing = 0.04.em, color = Ink),
      )
    }
    Spacer(Modifier.height(14.dp))
    Text(
      "Expires in ${left / 60}:${"%02d".format(left % 60)}",
      style = Styles.Small.copy(fontSize = 14.sp),
      textAlign = TextAlign.Center,
      modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.weight(1.3f))
    PrimaryButton("Pair", onClick = onPair)
    Spacer(Modifier.height(10.dp))
    SecondaryButton("Deny", onClick = onDeny)
    Spacer(Modifier.height(24.dp))
  }
}
