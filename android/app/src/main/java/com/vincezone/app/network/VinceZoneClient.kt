package com.vincezone.app.network

import com.vincezone.app.model.ChatMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class VinceZoneClient(private val baseUrl: String, private val apiKey: String = "") {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun sendMessage(
        model: String,
        messages: List<ChatMessage>
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val rootUrl = baseUrl.trimEnd('/')
            val endpoint = "$rootUrl/api/playground/chat"

            val jsonArray = JSONArray()
            for (msg in messages) {
                val obj = JSONObject()
                obj.put("role", msg.role)
                obj.put("content", msg.content)
                jsonArray.put(obj)
            }

            val payload = JSONObject().apply {
                put("model", model.ifBlank { "kilo-auto/free" })
                put("messages", jsonArray)
                put("message", messages.lastOrNull()?.content ?: "")
                put("mode", "chat")
                put("temperature", 0.7)
            }

            val requestBuilder = Request.Builder()
                .url(endpoint)
                .post(payload.toString().toRequestBody(jsonMediaType))

            if (apiKey.isNotBlank()) {
                requestBuilder.addHeader("Authorization", "Bearer $apiKey")
            }

            val response = client.newCall(requestBuilder.build()).execute()
            val body = response.body?.string().orEmpty()

            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("HTTP ${response.code}: $body"))
            }

            val jsonRes = JSONObject(body)
            val reply = when {
                jsonRes.has("reply") -> jsonRes.getString("reply")
                jsonRes.has("choices") -> {
                    val choices = jsonRes.getJSONArray("choices")
                    if (choices.length() > 0) {
                        choices.getJSONObject(0).getJSONObject("message").getString("content")
                    } else {
                        "Không nhận được nội dung từ AI."
                    }
                }
                jsonRes.has("error") -> jsonRes.getString("error")
                else -> body
            }

            Result.success(reply)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
