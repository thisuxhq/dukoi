package com.thisux.droidhost

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Talks to the agent's local-only endpoints on 127.0.0.1. Call off the main thread. */
object AgentClient {
  private const val BASE = "http://127.0.0.1:${AgentSupervisor.ADMIN_PORT}"

  fun get(path: String): JSONObject? = request("GET", path, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun getArray(path: String): JSONArray? = request("GET", path, null)?.let { runCatching { JSONArray(it) }.getOrNull() }

  fun post(path: String, body: JSONObject = JSONObject()): JSONObject? =
    request("POST", path, body)?.let { runCatching { JSONObject(it) }.getOrNull() }

  fun delete(path: String): JSONObject? = request("DELETE", path, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

  private fun request(method: String, path: String, body: JSONObject?): String? = runCatching {
    val conn = URL("$BASE$path").openConnection() as HttpURLConnection
    conn.requestMethod = method
    conn.connectTimeout = 1500
    conn.readTimeout = 3000
    if (body != null) {
      conn.doOutput = true
      conn.setRequestProperty("content-type", "application/json")
      conn.outputStream.use { it.write(body.toString().toByteArray()) }
    }
    val stream = if (conn.responseCode < 400) conn.inputStream else conn.errorStream
    stream.bufferedReader().use { it.readText() }
  }.getOrNull()
}
