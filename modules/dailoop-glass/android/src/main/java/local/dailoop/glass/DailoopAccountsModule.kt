package local.dailoop.glass

import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.CustomCredential
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.SecureRandom
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network

/** Google identity only. Data transmission/consent remains a separate JS action. */
class DailoopAccountsModule : Module() {
  private var connectivity: ConnectivityManager? = null
  private var callback: ConnectivityManager.NetworkCallback? = null
  private fun stopObserving() {
    val listener = callback
    callback = null
    val manager = connectivity
    connectivity = null
    if (listener != null && manager != null) {
      try { manager.unregisterNetworkCallback(listener) } catch (_: IllegalArgumentException) { /* Already detached by Android. */ }
    }
  }
  override fun definition() = ModuleDefinition {
    Name("DailoopAccounts")
    Events("onNetworkAvailable")
    OnStartObserving {
      val context = appContext.reactContext
      val manager = context?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      if (manager != null && callback == null) {
        val listener = object : ConnectivityManager.NetworkCallback() {
          override fun onAvailable(network: Network) { sendEvent("onNetworkAvailable", emptyMap<String, Any>()) }
        }
        manager.registerDefaultNetworkCallback(listener)
        connectivity = manager
        callback = listener
      }
    }
    OnStopObserving { stopObserving() }
    OnDestroy { stopObserving() }
    AsyncFunction("signIn") Coroutine { clientId: String ->
      require(clientId.matches(Regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$")))
      withContext(Dispatchers.Main) {
        val activity = appContext.currentActivity ?: throw IllegalStateException("No activity available")
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val nonce = bytes.joinToString("") { "%02x".format(it) }
        val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        try {
          val credential = CredentialManager.create(activity).getCredential(activity, request).credential
          if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw IllegalStateException("Unsupported Google credential")
          }
          GoogleIdTokenCredential.createFrom(credential.data).idToken
        } catch (_: GetCredentialCancellationException) {
          null
        }
      }
    }
  }
}
