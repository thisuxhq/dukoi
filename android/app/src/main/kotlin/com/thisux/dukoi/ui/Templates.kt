package com.thisux.dukoi.ui

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.dukoi.AppInfo
import com.thisux.dukoi.Phone
import com.thisux.dukoi.TemplateInfo
import com.thisux.dukoi.ui.theme.Amber
import com.thisux.dukoi.ui.theme.Blue
import com.thisux.dukoi.ui.theme.Body
import com.thisux.dukoi.ui.theme.Butter
import com.thisux.dukoi.ui.theme.Crashed
import com.thisux.dukoi.ui.theme.Border
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.DeepRed
import com.thisux.dukoi.ui.theme.Divider
import com.thisux.dukoi.ui.theme.Faint
import com.thisux.dukoi.ui.theme.Ink
import com.thisux.dukoi.ui.theme.Lilac
import com.thisux.dukoi.ui.theme.Mint
import com.thisux.dukoi.ui.theme.Muted
import com.thisux.dukoi.ui.theme.Orange
import com.thisux.dukoi.ui.theme.Peach
import com.thisux.dukoi.ui.theme.Pink
import com.thisux.dukoi.ui.theme.Rose
import com.thisux.dukoi.ui.theme.Running
import com.thisux.dukoi.ui.theme.Sky
import com.thisux.dukoi.ui.theme.Slate
import com.thisux.dukoi.ui.theme.SoftRed
import com.thisux.dukoi.ui.theme.SlateInk
import com.thisux.dukoi.ui.theme.Styles
import com.thisux.dukoi.ui.theme.Teal
import com.thisux.dukoi.ui.theme.TealInk
import com.thisux.dukoi.ui.theme.Violet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** How a template looks on the phone, and what you get from it. */
internal class Look(val icon: String, val tile: Color, val tint: Color, val gets: List<String>)

internal fun look(id: String) = when (id) {
  "static-site" -> Look("browser", Mint, Running, listOf("A link that works on your Wi-Fi", "A one-page site with your name", "Change it with one HTML file"))
  "notes-api" -> Look("api", Lilac, Violet, listOf("A link that works on your Wi-Fi", "Add, list and delete notes", "Notes saved on this phone"))
  "file-drop" -> Look("folder-01", Peach, Orange, listOf("An upload page on your Wi-Fi", "A link to share each file", "Files saved on this phone"))
  "mcp-server" -> Look("mcp-server", Rose, Pink, listOf("A link your AI assistant can use", "One example tool to call", "Running all day on this phone"))
  "telegram-bot" -> Look("telegram", Sky, Blue, listOf("A bot that answers on Telegram", "No public link needed", "Running all day on this phone"))
  "webhook-inbox" -> Look("webhook", Teal, TealInk, listOf("An address to send webhooks to", "Each one shown as it arrives", "Saved on this phone"))
  "uptime-watch" -> Look("activity-03", Butter, Amber, listOf("Your sites checked every minute", "A push when one goes down", "Running all day on this phone"))
  "cron-jobs" -> Look("clock-01", Slate, SlateInk, listOf("Code that runs on a schedule", "How each run went, on a page", "Running all day on this phone"))
  "redis" -> Look("database-lightning", SoftRed, Crashed, emptyList())
  "postgres" -> Look("database", Sky, Blue, emptyList())
  else -> Look("api", Lilac, Violet, listOf("A link that works on your Wi-Fi"))
}

private val Paragraph = Styles.Small.copy(fontSize = 14.sp, lineHeight = 20.sp)
private val Line = Styles.Body.copy(fontWeight = FontWeight.Normal)

@Composable
internal fun Chip(look: Look, size: Int) {
  Box(Modifier.size(size.dp).background(look.tile), contentAlignment = Alignment.Center) {
    Icon(look.icon, (size / 2).dp, look.tint)
  }
}

/** The home screen with no apps: templates to try, then the computer route. */
@Composable
fun TemplatesSection(templates: List<TemplateInfo>, onDeployed: (AppInfo) -> Unit) {
  var picked by remember { mutableStateOf<TemplateInfo?>(null) }
  Text("Try a template", style = Styles.CardTitle.copy(lineHeight = 26.sp))
  Spacer(Modifier.height(4.dp))
  Text("Live in a minute, right from this phone.", style = Paragraph)
  Spacer(Modifier.height(14.dp))
  Column(Modifier.fillMaxWidth().background(Divider), verticalArrangement = Arrangement.spacedBy(1.dp)) {
    templates.forEach { template -> TemplateRow(template) { picked = template } }
  }
  Spacer(Modifier.height(32.dp))
  Text("Or deploy your own app", style = Styles.CardTitle.copy(lineHeight = 26.sp))
  Spacer(Modifier.height(12.dp))
  Text("Pair your computer, then run this in your app’s folder.", style = Paragraph)
  Spacer(Modifier.height(16.dp))
  CommandBox("dukoi deploy", compact = true)

  picked?.let { template ->
    TemplateSheet(template, onDismiss = { picked = null }, onDeployed = { picked = null; onDeployed(it) })
  }
}

@Composable
internal fun TemplateRow(template: TemplateInfo, onClick: () -> Unit) {
  val look = look(template.id)
  Row(
    Modifier.fillMaxWidth().background(Card).tap(onClick).padding(horizontal = 16.dp, vertical = 14.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Chip(look, 40)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(template.name, style = Styles.CardTitle.copy(fontSize = 17.sp, lineHeight = 22.sp))
      Text(template.description, style = Styles.Small)
    }
    Spacer(Modifier.width(14.dp))
    Icon("arrow-right-01", 18.dp, Muted)
  }
}

/**
 * What a template gives you, and Deploy. A template that needs a setting, like the
 * Telegram bot's token, asks for it here; the token goes to the agent and stays on the phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TemplateSheet(template: TemplateInfo, onDismiss: () -> Unit, onDeployed: (AppInfo) -> Unit) {
  val scope = rememberCoroutineScope()
  val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val look = look(template.id)
  var secret by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  val ready = template.secret == null || secret.isNotBlank()

  fun deploy() {
    if (busy || !ready) return
    busy = true
    error = null
    val env = template.secret?.let { mapOf(it to secret.trim()) }.orEmpty()
    scope.launch {
      val result = withContext(Dispatchers.IO) { Phone.deployTemplate(template.id, env) }
      busy = false
      val app = result.app
      if (app == null) error = result.error
      else scope.launch { state.hide() }.invokeOnCompletion { onDeployed(app) }
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
      Spacer(Modifier.height(20.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Chip(look, 48)
        Spacer(Modifier.width(14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(template.name, style = Styles.Section)
          Text(template.description, style = Paragraph)
        }
      }
      Spacer(Modifier.height(20.dp))
      if (template.secret == null) {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
          look.gets.forEach { line ->
            Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
              Dot(Running)
              Spacer(Modifier.width(12.dp))
              Text(line, style = Line)
            }
          }
        }
      } else {
        TokenSteps(secret, onChange = { secret = it; error = null }, onDone = ::deploy)
      }
      Spacer(Modifier.height(20.dp))
      PrimaryButton(
        if (busy) "Deploying" else "Deploy",
        Modifier.graphicsLayer { alpha = if (ready) 1f else 0.4f },
        busy = busy,
        onClick = ::deploy,
      )
      Spacer(Modifier.height(12.dp))
      Text(
        error ?: if (template.secret == null) "Takes about 10 seconds. Remove it any time." else "The token stays on this phone.",
        style = Styles.Small,
        color = if (error != null) DeepRed else Muted,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
      )
    }
  }
}

/** The Telegram bot needs a token from @BotFather before it can run. */
@Composable
private fun TokenSteps(value: String, onChange: (String) -> Unit, onDone: () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
    Step(1) {
      Text(
        buildAnnotatedString {
          append("In Telegram, message ")
          withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("@BotFather") }
          append(" and send /newbot")
        },
        style = Line,
      )
    }
    Step(2) { Text("Paste the token it gives you", style = Line) }
  }
  Spacer(Modifier.height(12.dp))
  BasicTextField(
    value = value,
    onValueChange = onChange,
    singleLine = true,
    textStyle = Styles.Log.copy(fontSize = 15.sp, lineHeight = 20.sp, color = Ink),
    cursorBrush = SolidColor(Violet),
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done, autoCorrectEnabled = false),
    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { onDone() }),
    decorationBox = { inner ->
      Box(Modifier.fillMaxWidth().background(Card).border(1.dp, Border).padding(horizontal = 16.dp, vertical = 15.dp)) {
        if (value.isEmpty()) Text("123456:ABC-def…", style = Styles.Log.copy(fontSize = 15.sp, color = Muted))
        inner()
      }
    },
  )
}

@Composable
private fun Step(n: Int, content: @Composable () -> Unit) {
  Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp)) {
    Text("$n", style = Styles.CardTitle.copy(fontSize = 15.sp, lineHeight = 20.sp), color = Violet, modifier = Modifier.width(24.dp))
    content()
  }
}

/** On an app that came from a template: how to get its code and make it yours. */
@Composable
fun MakeItYoursCard(template: String) {
  Column(Modifier.fillMaxWidth().background(Lilac).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Text("Make it yours", style = Styles.CardTitle.copy(lineHeight = 26.sp))
    Text(
      "On your computer, run this. You get the code, and your next deploy replaces this one.",
      style = Styles.Small.copy(fontSize = 14.sp, lineHeight = 21.sp, color = Body),
    )
    Spacer(Modifier.height(4.dp))
    CommandBox("dukoi init $template", Modifier.fillMaxWidth(), compact = true)
  }
}
