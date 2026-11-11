package com.thisux.droidhost.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import com.caverock.androidsvg.SVG

/**
 * Draws an SVG from assets. Icons are Hugeicons with currentColor, so [tint]
 * replaces it. Illustrations keep their own colours.
 */
@Composable
fun Svg(asset: String, size: Dp, modifier: Modifier = Modifier, tint: Color? = null) {
  val context = LocalContext.current
  val picture = remember(asset, tint) {
    var text = context.assets.open(asset).bufferedReader().use { it.readText() }
    if (tint != null) text = text.replace("currentColor", "#%06X".format(tint.toArgb() and 0xFFFFFF))
    val svg = SVG.getFromString(text)
    svg.renderToPicture()
  }
  Canvas(modifier.size(size)) {
    drawIntoCanvas { canvas ->
      val c = canvas.nativeCanvas
      val scale = minOf(this.size.width / picture.width, this.size.height / picture.height)
      c.save()
      c.translate((this.size.width - picture.width * scale) / 2, (this.size.height - picture.height * scale) / 2)
      c.scale(scale, scale)
      c.drawPicture(picture)
      c.restore()
    }
  }
}

@Composable
fun Icon(name: String, size: Dp, tint: Color, modifier: Modifier = Modifier) =
  Svg("icons/$name.svg", size, modifier, tint)

