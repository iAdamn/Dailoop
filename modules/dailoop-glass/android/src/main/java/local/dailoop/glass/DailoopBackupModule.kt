package local.dailoop.glass

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.FileNotFoundException

/** Reads a user-granted document stream off the UI thread, with a fixed native cap. */
class DailoopBackupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DailoopBackup")
    AsyncFunction("readBackup") Coroutine { uriText: String ->
      withContext(Dispatchers.IO) {
        val uri = Uri.parse(uriText)
        require(uri.scheme == "content" || uri.scheme == "file") { "Documento no compatible." }
        val context = requireNotNull(appContext.reactContext) { "La aplicación no está disponible." }
        val stream = context.contentResolver.openInputStream(uri)
          ?: throw FileNotFoundException("No se pudo abrir el documento elegido.")
        BoundedBackupReader.readUtf8(stream, 50 * 1024 * 1024)
      }
    }
  }
}
