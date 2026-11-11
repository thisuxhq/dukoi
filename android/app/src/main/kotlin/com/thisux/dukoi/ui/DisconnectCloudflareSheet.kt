package com.thisux.dukoi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.dukoi.DomainStatus
import com.thisux.dukoi.Phone
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.Crashed
import com.thisux.dukoi.ui.theme.Faint
import com.thisux.dukoi.ui.theme.Styles
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Asks before disconnecting, and says plainly which public links stop working. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DisconnectCloudflareSheet(status: DomainStatus, onDismiss: () -> Unit, onDone: () -> Unit) {
  val toast = LocalToast.current
  val scope = rememberCoroutineScope()
  val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  var busy by remember { mutableStateOf(false) }

  fun close(then: () -> Unit) = scope.launch { state.hide() }.invokeOnCompletion { then() }

  fun disconnect() {
    if (busy) return
    busy = true
    scope.launch {
      val problem = withContext(Dispatchers.IO) { Phone.disconnectCloudflare() }
      busy = false
      if (problem == null) {
        toast.show("Disconnected from Cloudflare")
        close(onDone)
      } else {
        toast.show(problem, error = true)
      }
    }
  }

  val hostnames = status.domains.map { it.hostname }
  val impact = when (hostnames.size) {
    0 -> "No apps use it right now. You can connect again when you add a domain."
    1 -> "${hostnames[0]} will stop working. Dukoi removes only the DNS records it made."
    else -> "${hostnames.size} public links will stop working. Dukoi removes only the DNS records it made."
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
      Text("Disconnect Cloudflare?", style = Styles.Section)
      Spacer(Modifier.height(8.dp))
      Text(impact, style = Styles.Small.copy(fontSize = 15.sp, lineHeight = 22.sp))
      Spacer(Modifier.height(24.dp))
      Box(
        Modifier.fillMaxWidth().height(52.dp).background(Crashed, RoundedCornerShape(4.dp)).press(::disconnect),
        contentAlignment = Alignment.Center,
      ) { Text(if (busy) "Disconnecting" else "Disconnect", style = Styles.Button, color = Card) }
      Spacer(Modifier.height(6.dp))
      Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        QuietButton("Cancel") { if (!busy) close(onDismiss) }
      }
    }
  }
}
