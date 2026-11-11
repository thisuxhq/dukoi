package com.thisux.droidhost.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val Scheme = lightColorScheme(
  primary = Violet,
  onPrimary = Card,
  background = Canvas,
  onBackground = Ink,
  surface = Card,
  onSurface = Ink,
  error = Crashed,
)

/** One light theme, as designed. */
@Composable
fun DroidHostTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = Scheme, typography = Typography, content = content)
}
