package local.dailoop.glass

import android.content.Context
import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Only the small navigation row is sampled, never scrolling screen content.
 * Uniforms are driven by Reanimated props on the UI thread; no bitmaps, polling
 * loop, camera, network, graphics dependency or background rendering. */
class DailoopGlassView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var lensPosition = 0f
  private var lensEnabled = true
  private var shader: RuntimeShader? = null
  private var shaderUnavailable = false

  init { clipChildren = false; clipToPadding = false }

  fun setLensPosition(position: Float) {
    lensPosition = if (position.isFinite()) position.coerceIn(0f, 3f) else 0f
    updateLens()
  }

  fun setLensEnabled(enabled: Boolean) {
    lensEnabled = enabled
    updateLens()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateLens()
  }

  private fun updateLens() {
    if (Build.VERSION.SDK_INT < 33) return
    if (!lensEnabled || width <= 0 || height <= 0 || shaderUnavailable) {
      setRenderEffect(null)
      return
    }
    applyLens()
  }

  @RequiresApi(33)
  private fun applyLens() {
    try {
      val water = shader ?: RuntimeShader(WATER_SHADER).also { shader = it }
      val density = resources.displayMetrics.density
      val cell = width / 4f
      water.setFloatUniform("lensCenter", (lensPosition + .5f) * cell, height / 2f)
      water.setFloatUniform("lensHalfSize", (cell - 2f * density) / 2f, height / 2f)
      water.setFloatUniform("pixelScale", density)
      // RenderEffect snapshots uniforms. Re-create only this tiny effect when
      // the contact position changes; the compiled shader itself is retained.
      // View.setRenderEffect invalidates its RenderNode property internally.
      // Do not invalidate child display lists while only the lens moves.
      setRenderEffect(RenderEffect.createRuntimeShaderEffect(water, "content"))
    } catch (failure: IllegalArgumentException) {
      shaderUnavailable = true
      setRenderEffect(null)
      Log.w("DailoopGlass", "GPU refraction unavailable; keeping readable navigation", failure)
    }
  }

  companion object {
    // A rounded water meniscus bends coordinates non-linearly near its rim.
    // Separate RGB samples add subtle dispersion rather than scaling a glyph.
    private const val WATER_SHADER = """
      uniform shader content;
      uniform float2 lensCenter;
      uniform float2 lensHalfSize;
      uniform float pixelScale;

      half4 main(float2 p) {
        float2 delta = p - lensCenter;
        float radius = min(21.0 * pixelScale, lensHalfSize.y);
        float2 q = abs(delta) - lensHalfSize + radius;
        float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        if (edge >= 0.0) return content.eval(p);

        float depth = clamp(-edge / (20.0 * pixelScale), 0.0, 1.0);
        // A broad, shallow meniscus preserves small labels at the rim.
        float entering = smoothstep(0.0, 0.5, depth);
        float bend = entering * (0.045 + 0.07 * pow(1.0 - depth, 2.0));
        float2 source = p - delta * bend;
        float2 normal = delta / max(length(delta), 1.0);
        float dispersion = entering * pow(1.0 - depth, 2.0) * 0.8 * pixelScale;
        half4 red = content.eval(source + normal * dispersion);
        half4 green = content.eval(source);
        half4 blue = content.eval(source - normal * dispersion);
        half a = max(red.a, max(green.a, blue.a));
        half3 rgb = min(half3(red.r, green.g, blue.b), half3(a));
        float rim = (1.0 - smoothstep(0.0, 1.6 * pixelScale, -edge));
        float light = max(0.0, dot(normal, normalize(float2(-0.4, -0.9))));
        half highlight = half(rim * light * 0.11);
        return half4(min(rgb + highlight, half3(a + highlight)), min(1.0h, a + highlight));
      }
    """
  }
}
