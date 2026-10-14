package local.dailoop.glass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DailoopGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DailoopGlass")
    View(DailoopGlassView::class) {
      Prop("lensPosition") { view: DailoopGlassView, position: Float ->
        view.setLensPosition(position)
      }
      Prop("lensEnabled") { view: DailoopGlassView, enabled: Boolean ->
        view.setLensEnabled(enabled)
      }
    }
  }
}
