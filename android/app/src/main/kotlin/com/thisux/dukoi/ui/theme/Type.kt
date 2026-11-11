package com.thisux.dukoi.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.thisux.dukoi.R

// Outfit for headlines, Inter for everything else, Geist Mono for code and logs.

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: Int) =
  Font(res, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

val Outfit = FontFamily(variable(R.font.outfit, 500))

val Inter = FontFamily(
  Font(R.font.inter_regular, FontWeight.Normal),
  Font(R.font.inter_medium, FontWeight.Medium),
  Font(R.font.inter_semibold, FontWeight.SemiBold),
)

val GeistMono = FontFamily(variable(R.font.geist_mono, 400), variable(R.font.geist_mono, 500))

object Styles {
  /** Onboarding headlines. Balanced breaks, so no word sits alone on the last line. */
  val Hero = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 52.sp, lineHeight = 54.sp, letterSpacing = (-0.03).em, color = Ink, lineBreak = LineBreak.Heading)
  /** Screen titles: "Apps", "hono-api", "Settings" */
  val Title = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 40.sp, lineHeight = 44.sp, letterSpacing = (-0.03).em, color = Ink, lineBreak = LineBreak.Heading)
  val Section = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp, color = Ink)
  val CardTitle = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 20.sp, lineHeight = 24.sp, color = Ink)
  val Number = TextStyle(fontFamily = Outfit, fontWeight = FontWeight.Medium, fontSize = 22.sp, lineHeight = 28.sp, color = Ink)
  val Button = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 20.sp)
  val Body = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp, color = Ink)
  val Label = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, color = Ink)
  val Small = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp, color = Muted)
  val Code = TextStyle(fontFamily = GeistMono, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp, color = Color.White)
  val Log = TextStyle(fontFamily = GeistMono, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp, color = LogText)
}

val Typography = Typography(bodyLarge = Styles.Body)
