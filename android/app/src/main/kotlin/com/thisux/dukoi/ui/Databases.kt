package com.thisux.dukoi.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.dukoi.AppInfo
import com.thisux.dukoi.AppState
import com.thisux.dukoi.DatabaseInfo
import com.thisux.dukoi.DatabaseKind
import com.thisux.dukoi.DbOutcome
import com.thisux.dukoi.LogLine
import com.thisux.dukoi.Phone
import com.thisux.dukoi.TemplateInfo
import com.thisux.dukoi.formatUptime
import com.thisux.dukoi.ui.theme.Border
import com.thisux.dukoi.ui.theme.Canvas
import com.thisux.dukoi.ui.theme.Card
import com.thisux.dukoi.ui.theme.Crashed
import com.thisux.dukoi.ui.theme.DeepRed
import com.thisux.dukoi.ui.theme.Divider
import com.thisux.dukoi.ui.theme.Faint
import com.thisux.dukoi.ui.theme.Ink
import com.thisux.dukoi.ui.theme.Muted
import com.thisux.dukoi.ui.theme.Styles
import com.thisux.dukoi.ui.theme.Violet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

// Databases and the Templates screen, following the Paper design (Dashboard page, "Mobile · 4–7").

private val Paragraph = Styles.Small.copy(fontSize = 14.sp, lineHeight = 20.sp)
private val Mono = Styles.Log.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Ink)

/** "redis://default:abc…@127.0.0.1:6380" → "redis://default:••••••••@127.0.0.1:6380". Copy gives the real one. */
fun masked(url: String) = url.replace(Regex(":([^:@/]+)@"), ":••••••••@")

/** The two places on the phone: Apps and Templates. Sits at the bottom of both screens. */
@Composable
fun BottomNav(templates: Boolean, onApps: () -> Unit, onTemplates: () -> Unit) {
  Column(Modifier.fillMaxWidth().background(Card)) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Divider))
    Row(Modifier.fillMaxWidth().navigationBarsPadding().height(64.dp)) {
      NavItem("Apps", "server-stack-01-solid", selected = !templates, Modifier.weight(1f), onApps)
      NavItem("Templates", "layers-01-solid", selected = templates, Modifier.weight(1f), onTemplates)
    }
  }
}

@Composable
private fun NavItem(label: String, icon: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
  val color = if (selected) Ink else Muted
  Column(
    modifier.fillMaxSize().then(if (selected) Modifier else Modifier.tap(onClick)),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    Icon(icon, 24.dp, color)
    Spacer(Modifier.height(4.dp))
    Text(label, style = Styles.Label.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = if (selected) Styles.Button.fontWeight else Styles.Label.fontWeight), color = color)
  }
}

/** Settings, top-right, level with the title. */
@Composable
fun SettingsButton(modifier: Modifier, onClick: () -> Unit) {
  Box(modifier.size(40.dp).background(Card).tap(onClick), contentAlignment = Alignment.Center) {
    Icon("settings-02", 20.dp, Ink)
  }
}

/** Databases to make, then the app templates. */
@Composable
fun TemplatesScreen(
  kinds: List<DatabaseKind>,
  templates: List<TemplateInfo>,
  appNames: List<String>,
  databaseNames: List<String>,
  phoneName: String,
  onApps: () -> Unit,
  onSettings: () -> Unit,
  onDeployed: (AppInfo) -> Unit,
  onCreated: (DatabaseInfo) -> Unit,
) {
  var template by remember { mutableStateOf<TemplateInfo?>(null) }
  var kind by remember { mutableStateOf<DatabaseKind?>(null) }
  Column(Modifier.fillMaxSize().background(Canvas)) {
    Box(Modifier.weight(1f).statusBarsPadding()) {
      Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Gutter)) {
        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.Top) {
          Text("Templates", style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp), modifier = Modifier.weight(1f))
          SettingsButton(Modifier.padding(top = 4.dp), onSettings)
        }
        if (kinds.isNotEmpty()) {
          Spacer(Modifier.height(28.dp))
          Text("Databases", style = Styles.Section)
          Spacer(Modifier.height(12.dp))
          Column(Modifier.fillMaxWidth().background(Divider), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            kinds.forEach { k -> DatabaseCard(k) { kind = k } }
          }
        }
        if (templates.isNotEmpty()) {
          Spacer(Modifier.height(32.dp))
          Text("Apps", style = Styles.Section)
          Spacer(Modifier.height(12.dp))
          Column(Modifier.fillMaxWidth().background(Divider), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            templates.forEach { t -> TemplateRow(t) { template = t } }
          }
        }
        Spacer(Modifier.height(28.dp))
      }
    }
    BottomNav(templates = true, onApps = onApps, onTemplates = {})
  }
  template?.let { t ->
    TemplateSheet(t, onDismiss = { template = null }, onDeployed = { template = null; onDeployed(it) })
  }
  kind?.let { k ->
    CreateDatabaseSheet(k, appNames, databaseNames, phoneName, onDismiss = { kind = null }, onCreated = { kind = null; onCreated(it) })
  }
}

@Composable
private fun DatabaseCard(kind: DatabaseKind, onCreate: () -> Unit) {
  Column(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Chip(look(kind.id), 48)
      Spacer(Modifier.width(14.dp))
      Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(kind.name, style = Styles.Section)
        Text(kind.description, style = Styles.Small)
      }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
      Text(
        buildAnnotatedString {
          append("Your apps get ")
          withStyle(SpanStyle(fontFamily = Styles.Log.fontFamily, color = Ink)) { append(kind.envName) }
        },
        style = Styles.Small,
        modifier = Modifier.weight(1f),
      )
      if (kind.available) {
        SecondaryButton("Create", Modifier.width(96.dp), height = 40.dp, onClick = onCreate)
      } else {
        Text("Update Dukoi to get this", style = Styles.Small, modifier = Modifier.width(140.dp))
      }
    }
  }
}

/** A square tick box, like the dashboard's. */
@Composable
fun CheckBox(checked: Boolean) {
  Box(
    Modifier.size(20.dp).then(
      if (checked) Modifier.background(Violet, RoundedCornerShape(4.dp))
      else Modifier.background(Card, RoundedCornerShape(4.dp)).border(1.5.dp, Border, RoundedCornerShape(4.dp)),
    ),
    contentAlignment = Alignment.Center,
  ) { if (checked) Icon("tick-02", 14.dp, Card) }
}

/** Name it, pick the apps that get its URL, and whether the Wi-Fi can reach it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateDatabaseSheet(
  kind: DatabaseKind,
  appNames: List<String>,
  takenNames: List<String>,
  phoneName: String,
  onDismiss: () -> Unit,
  onCreated: (DatabaseInfo) -> Unit,
) {
  val scope = rememberCoroutineScope()
  val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val suggested = remember {
    if (kind.id !in takenNames) kind.id else generateSequence(2) { it + 1 }.map { "${kind.id}-$it" }.first { it !in takenNames }
  }
  var name by remember { mutableStateOf(suggested) }
  var picked by remember { mutableStateOf(emptySet<String>()) }
  var wifi by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  fun create() {
    if (busy) return
    busy = true
    error = null
    scope.launch {
      val result = withContext(Dispatchers.IO) { Phone.createDatabase(kind.id, name, picked.toList(), wifi) }
      busy = false
      val db = result.db
      if (db == null) error = result.error
      else scope.launch { state.hide() }.invokeOnCompletion { onCreated(db) }
    }
  }

  ModalBottomSheet(
    onDismissRequest = { if (!busy) onDismiss() },
    sheetState = state,
    containerColor = Canvas,
    shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
    dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 4.dp).background(Faint)) },
  ) {
    Column(
      Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = Gutter).padding(bottom = 24.dp),
    ) {
      Spacer(Modifier.height(20.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Chip(look(kind.id), 48)
        Spacer(Modifier.width(14.dp))
        Text("New ${kind.name}", style = Styles.Title.copy(fontSize = 28.sp, lineHeight = 32.sp))
      }
      Spacer(Modifier.height(12.dp))
      Text(
        "Runs on $phoneName next to your apps. Data is saved to the phone, so it survives restarts." +
          if (kind.id == "postgres") " It uses about 400 MB of memory while it runs." else "",
        style = Paragraph,
      )
      Spacer(Modifier.height(24.dp))
      Text("Name", style = Styles.Label)
      Spacer(Modifier.height(8.dp))
      BasicTextField(
        value = name,
        onValueChange = { name = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' }.take(40); error = null },
        singleLine = true,
        textStyle = Styles.Log.copy(fontSize = 15.sp, lineHeight = 20.sp, color = Ink),
        cursorBrush = SolidColor(Violet),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Done),
        decorationBox = { inner ->
          Box(Modifier.fillMaxWidth().background(Card).border(1.dp, Border, RoundedCornerShape(4.dp)).padding(horizontal = 14.dp, vertical = 13.dp)) { inner() }
        },
      )
      if (appNames.isNotEmpty()) {
        Spacer(Modifier.height(24.dp))
        Text(
          buildAnnotatedString {
            append("Give these apps ")
            withStyle(SpanStyle(fontFamily = Styles.Log.fontFamily)) { append(kind.envName) }
          },
          style = Styles.Label,
        )
        Spacer(Modifier.height(4.dp))
        Text("They restart once to pick it up.", style = Styles.Small)
        Spacer(Modifier.height(12.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, Divider).background(Divider), verticalArrangement = Arrangement.spacedBy(1.dp)) {
          appNames.forEach { app ->
            Row(
              Modifier.fillMaxWidth().height(52.dp).background(Card).tap { picked = if (app in picked) picked - app else picked + app }.padding(horizontal = 16.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              CheckBox(app in picked)
              Spacer(Modifier.width(14.dp))
              Text(app, style = Styles.CardTitle.copy(fontSize = 17.sp, lineHeight = 22.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
          }
        }
      }
      Spacer(Modifier.height(24.dp))
      Row(Modifier.fillMaxWidth().border(1.dp, Divider).tap { wifi = !wifi }.padding(16.dp)) {
        CheckBox(wifi)
        Spacer(Modifier.width(14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text("Also reachable on Wi-Fi", style = Styles.Body.copy(fontSize = 14.sp))
          Text("Your computer and other devices on this network can connect. Dukoi adds a password.", style = Styles.Small)
        }
      }
      Spacer(Modifier.height(20.dp))
      Text(error ?: "It never gets a public link.", style = Styles.Small, color = if (error != null) DeepRed else Muted)
      Spacer(Modifier.height(14.dp))
      PrimaryButton(if (busy) "Starting ${kind.name}" else "Create ${kind.name}", busy = busy, onClick = ::create)
    }
  }
}

/** A database on the Home screen, under the apps. */
@Composable
fun DatabaseRow(db: DatabaseInfo, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().background(Card).tap(onClick).padding(horizontal = 16.dp, vertical = 18.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(db.name, style = Styles.CardTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(masked(db.url), style = Styles.Log.copy(fontSize = 12.sp, color = Muted), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    Spacer(Modifier.width(12.dp))
    StateLabel(db.state)
  }
}

/** One database: its URLs, Wi-Fi, the apps that use it, and its logs. */
@Composable
fun DatabaseScreen(
  db: DatabaseInfo,
  logs: List<LogLine>,
  allApps: List<String>,
  onBack: () -> Unit,
  onChanged: () -> Unit,
  onRemoved: () -> Unit,
) {
  val clipboard = LocalClipboardManager.current
  val toast = LocalToast.current
  val scope = rememberCoroutineScope()
  var busy by remember { mutableStateOf(false) }
  var picking by remember { mutableStateOf(false) }
  var removing by remember { mutableStateOf(false) }
  val live = db.state == AppState.RUNNING
  val unconnected = allApps.filter { it !in db.apps }

  // Every action confirms itself: a note while it runs, then what happened.
  fun act(doing: String, done: String, run: () -> DbOutcome) {
    if (busy) return
    busy = true
    toast.show(doing)
    scope.launch {
      val result = withContext(Dispatchers.IO) { run() }
      busy = false
      if (result.error == null) toast.show(done) else toast.show(result.error, error = true)
      onChanged()
    }
  }
  fun change(doing: String, done: String, body: JSONObject) = act(doing, done) { Phone.changeDatabase(db.name, body) }

  WithLogs(db.name, logs) {
    BackLink("Apps", onBack)
    Column(Modifier.padding(horizontal = Gutter)) {
      Spacer(Modifier.height(12.dp))
      Text(db.name, style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp))
      Spacer(Modifier.height(10.dp))
      StateLabel(db.state, bold = true)
      Spacer(Modifier.height(24.dp))
      Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 320.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
          UrlRow("Apps on this phone", db.url) { clipboard.setText(AnnotatedString(db.url)); toast.show("URL copied") }
          db.wifiUrl?.let { url -> UrlRow("Wi-Fi", url) { clipboard.setText(AnnotatedString(url)); toast.show("Wi-Fi URL copied") } }
          Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
              Modifier.weight(1f).tap {
                val on = db.wifiUrl == null
                change(
                  if (on) "Opening it to your Wi-Fi" else "Closing it to your Wi-Fi",
                  if (on) "${db.name} is reachable on your Wi-Fi" else "${db.name} is for this phone’s apps only",
                  JSONObject().put("wifi", on),
                )
              },
              verticalAlignment = Alignment.CenterVertically,
            ) {
              CheckBox(db.wifiUrl != null)
              Spacer(Modifier.width(14.dp))
              Text("Also reachable on Wi-Fi", style = Styles.Body.copy(fontSize = 14.sp))
            }
            Text(
              "New password",
              style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight),
              color = Violet,
              modifier = Modifier.tap {
                change("Making a new password", "New password made. Connected apps have it.", JSONObject().put("newPassword", true))
              }.padding(vertical = 6.dp),
            )
          }
        }
        Spacer(Modifier.height(12.dp))
        StatsCard(
          listOf(
            (db.cpuPercent?.takeIf { live }?.let { "${Math.round(it)}%" } ?: "–") to "CPU",
            (db.memoryMb?.takeIf { live }?.let { "${Math.round(it)} MB" } ?: "–") to "Memory",
            (if (live) formatUptime(db.startedAt) else "–") to "Uptime",
          ),
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          SecondaryButton("Restart", Modifier.weight(1f), height = 44.dp, square = true) {
            act("Restarting ${db.name}", "Restarted ${db.name}") { Phone.controlDatabase(db.name, "restart") }
          }
          if (db.state == AppState.STOPPED) {
            SecondaryButton("Start", Modifier.weight(1f), height = 44.dp, square = true) {
              act("Starting ${db.name}", "Started ${db.name}") { Phone.controlDatabase(db.name, "start") }
            }
          } else {
            SecondaryButton("Stop", Modifier.weight(1f), height = 44.dp, square = true) {
              act("Stopping ${db.name}", "Stopped ${db.name}") { Phone.controlDatabase(db.name, "stop") }
            }
          }
        }

        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text("Used by", style = Styles.Section, modifier = Modifier.weight(1f))
          if (unconnected.isNotEmpty()) {
            Text(
              if (picking) "Done" else "Connect an app",
              style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight),
              color = Violet,
              modifier = Modifier.tap { picking = !picking }.padding(vertical = 6.dp),
            )
          }
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
          db.apps.forEach { app ->
            AppLine(app, "Disconnect", Muted) {
              change("Taking ${db.envName} from $app", "$app no longer has ${db.envName}", JSONObject().put("disconnect", JSONArray(listOf(app))))
            }
          }
          if (picking) {
            unconnected.forEach { app ->
              AppLine(app, "Connect", Violet) {
                picking = false
                change("Giving ${db.envName} to $app", "$app has ${db.envName}", JSONObject().put("connect", JSONArray(listOf(app))))
              }
            }
          }
        }
        if (db.apps.isEmpty() && !picking) {
          Text(
            buildAnnotatedString {
              append("No apps have ")
              withStyle(SpanStyle(fontFamily = Styles.Log.fontFamily)) { append(db.envName) }
              append(" yet.")
            },
            style = Styles.Small,
          )
        }
        Spacer(Modifier.height(10.dp))
        Text("Connected apps restart once to pick it up.", style = Styles.Small)
        Spacer(Modifier.height(24.dp))
        Text(
          "Delete ${db.name}",
          style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight),
          color = Crashed,
          modifier = Modifier.tap { removing = true }.padding(vertical = 6.dp),
        )
      }
    }
  }
  if (removing) DeleteDatabaseSheet(db, onDismiss = { removing = false }, onDone = { removing = false; onRemoved() })
}

@Composable
private fun UrlRow(label: String, url: String, onCopy: () -> Unit) {
  Row(Modifier.fillMaxWidth().background(Card).padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(label, style = Styles.Small.copy(fontSize = 12.sp, lineHeight = 16.sp))
      Text(masked(url), style = Mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    CopyButton(Muted, 18.dp, 32.dp, onCopy)
  }
}

@Composable
private fun AppLine(app: String, action: String, color: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth().background(Card).padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
    Text(app, style = Styles.CardTitle.copy(fontSize = 17.sp, lineHeight = 22.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
    Text(action, style = Styles.Label.copy(fontSize = 14.sp, fontWeight = Styles.Button.fontWeight), color = color, modifier = Modifier.tap(onClick).padding(vertical = 4.dp))
  }
}

/** Asks before deleting, and says what goes with it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeleteDatabaseSheet(db: DatabaseInfo, onDismiss: () -> Unit, onDone: () -> Unit) {
  val toast = LocalToast.current
  val scope = rememberCoroutineScope()
  val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  var busy by remember { mutableStateOf(false) }

  fun close(then: () -> Unit) = scope.launch { state.hide() }.invokeOnCompletion { then() }

  fun delete() {
    if (busy) return
    busy = true
    scope.launch {
      val problem = withContext(Dispatchers.IO) { Phone.removeDatabase(db.name) }
      busy = false
      if (problem == null) {
        toast.show("Removed ${db.name}")
        close(onDone)
      } else {
        toast.show(problem, error = true)
      }
    }
  }

  ModalBottomSheet(
    onDismissRequest = { if (!busy) onDismiss() },
    sheetState = state,
    containerColor = Canvas,
    shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp),
    dragHandle = { Box(Modifier.padding(top = 10.dp).size(40.dp, 4.dp).background(Faint)) },
  ) {
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Gutter).padding(bottom = 24.dp)) {
      Spacer(Modifier.height(16.dp))
      Text("Delete ${db.name}?", style = Styles.Section)
      Spacer(Modifier.height(8.dp))
      Text(
        "Its data is deleted from the phone and can’t be brought back. Connected apps lose ${db.envName}.",
        style = Styles.Small.copy(fontSize = 15.sp, lineHeight = 22.sp),
      )
      Spacer(Modifier.height(24.dp))
      PrimaryButton(if (busy) "Deleting" else "Delete", color = Crashed, busy = busy, onClick = ::delete)
      Spacer(Modifier.height(6.dp))
      Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        QuietButton("Cancel") { if (!busy) close(onDismiss) }
      }
    }
  }
}
