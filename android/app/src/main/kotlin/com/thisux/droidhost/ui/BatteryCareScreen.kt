package com.thisux.droidhost.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.thisux.droidhost.BatteryCare
import com.thisux.droidhost.ChargeLimit
import com.thisux.droidhost.ui.theme.Canvas
import com.thisux.droidhost.ui.theme.Card
import com.thisux.droidhost.ui.theme.Muted
import com.thisux.droidhost.ui.theme.Restarting
import com.thisux.droidhost.ui.theme.Running
import com.thisux.droidhost.ui.theme.Styles

/** A phone that's plugged in all day wears out its battery. This screen says so and links to the fix. */
@Composable
fun BatteryCareScreen(care: BatteryCare, onBack: () -> Unit, onTurnOn: () -> Unit) {
  Column(Modifier.fillMaxSize().background(Canvas).systemBarsPadding().verticalScroll(rememberScrollState())) {
    BackLink("Settings", onBack)
    Column(Modifier.padding(horizontal = Gutter)) {
      Spacer(Modifier.height(20.dp))
      Text("Battery care", style = Styles.Title.copy(fontSize = 44.sp, lineHeight = 48.sp))
      Spacer(Modifier.height(32.dp))
      StatsCard(
        listOf(
          (care.now.level?.let { "$it%" } ?: "–") to "Charge",
          (care.now.temperatureC?.let { "$it°C" } ?: "–") to "Temperature",
          care.now.health to "Health",
        ),
        big = true,
      )

      Section("Charge limit") {
        Column(Modifier.fillMaxWidth().background(Card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Stop charging at 80%", style = Styles.Body.copy(fontWeight = Styles.Button.fontWeight), modifier = Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              Dot(limitColor(care.limit))
              Text(limitLabel(care.limit), style = Styles.Label)
            }
          }
          Text(
            when (care.limit) {
              ChargeLimit.ON -> "Charging stops at 80%, so the battery stays healthy while the phone is plugged in."
              ChargeLimit.OFF -> "This phone is plugged in all day. Stopping at 80% keeps the battery from wearing out."
              ChargeLimit.UNKNOWN -> "Plug the phone in and DroidHost can tell whether charging stops at 80%."
            },
            style = Styles.Small.copy(fontSize = 14.sp, lineHeight = 20.sp),
          )
        }
        if (care.limit != ChargeLimit.ON) {
          Spacer(Modifier.height(16.dp))
          PrimaryButton("Turn on", onClick = onTurnOn)
          Spacer(Modifier.height(12.dp))
          Text("Opens your phone’s battery settings", style = Styles.Small, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
      }

      Section("Last 7 days") {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
          InfoRow("Time at 100%") {
            Text(care.week.hoursFullPerDay?.let(::hoursLabel) ?: "No data yet", style = Styles.Label)
          }
          InfoRow("Hottest") {
            val hottest = care.week.hottestC?.let { c -> care.week.hottestDay?.let { "$c°C on $it" } ?: "$c°C" }
            Text(hottest ?: "No data yet", style = Styles.Label)
          }
        }
      }
      Spacer(Modifier.height(28.dp))
    }
  }
}

/** 0 → "None", 0.3 → "Under 1h a day", 21.6 → "22h a day". */
private fun hoursLabel(hours: Double) = when {
  hours <= 0.0 -> "None"
  hours < 1.0 -> "Under 1h a day"
  else -> "${Math.round(hours).coerceAtMost(24)}h a day"
}

fun limitColor(limit: ChargeLimit) = when (limit) {
  ChargeLimit.ON -> Running
  ChargeLimit.OFF -> Restarting
  ChargeLimit.UNKNOWN -> Muted
}

private fun limitLabel(limit: ChargeLimit) = when (limit) {
  ChargeLimit.ON -> "On"
  ChargeLimit.OFF -> "Off"
  ChargeLimit.UNKNOWN -> "Not sure"
}
