package com.vincezone.app.network

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.vincezone.app.utils.PreferencesManager
import okhttp3.*
import java.io.IOException
import java.util.concurrent.TimeUnit

class VinceZoneClient(private val prefs: PreferencesManager) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            val builder = original.newBuilder()
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
            if (prefs.apiKey.isNotBlank()) {
                builder.header("Authorization", "Bearer ${prefs.apiKey}")
            }
            chain.proceed(builder.build())
        }
        .build()

    private val gson = Gson()
    private val baseUrl = prefs.serverUrl
    private val model = prefs.selectedModel

    suspend fun sendMessage(
        messages: List<ChatMessage>,
        temperature: Float = prefs.temperature,
        maxTokens: Int = prefs.maxTokens,
        systemPrompt: String = prefs.systemPrompt,
        onStream: (String) -> Unit
    ): Result<String> {
        val url = "$baseUrl/v1/chat/completions"

        val messagesJson = JsonObject().apply {
            addProperty("model", model)
            add("messages", gson.toJsonTree(messages))
            addProperty("temperature", temperature)
            addProperty("max_tokens", maxTokens)
            addProperty("stream", true)
            if (prefs.systemPrompt.isNotBlank()) {
                addProperty("system_prompt", prefs.systemPrompt)
            }
        }

        val requestBody = RequestBody.create(
            MediaType.get("application/json; charset=utf-8"),
            gson.toJson(messagesJson)
        )

        val request = Request.Builder()
            .url("$baseUrl/v1/chat/completions")
            .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), gson.toJson(messagesJson)))
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                val errorBody = response.body?.string() ?: "Unknown error"
                return Result.failure(IOException("HTTP ${response.code}: $errorBody"))
            }

            val responseBody = response.body ?: return Result.failure(IOException("Empty response"))
            val source = response.body?.source() ?: return Result.failure(IOException("No source"))

            var fullResponse = ""
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                if (line.startsWith("data: ")) {
                    val data = line.substring(6)
                    if (data == "[DONE]") break
                    try {
                        val json = com.google.gson.JsonParser.parseString(data).asJsonObject
                        val delta = json.getAsJsonObject("choices")?.getAsJsonArray(0)?.getAsJsonObject("delta")
                        val content = delta?.get("content")?.asString ?: continue
                        if (content.isNotBlank()) {
                            fullResponse += content
                        }
                    } catch (e: Exception) {
                        Log.w("VinceZoneClient", "Parse error: ${e.message}")
                    }
                }
            }
            Result.success(fullResponse)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendMessageSimple(
        userMessage: String,
        systemPrompt: String = prefs.systemPrompt
    ): Result<String> {
        val messages = listOf(
            ChatMessage("system", prefs.systemPrompt),
            ChatMessage("user", userMessage)
        )
        return sendMessage(messages, onStream = { })
    }

    suspend fun testConnection(): Result<Boolean> {
        val request = Request.Builder()
            .url("$baseUrl/v1/models")
            .get()
            .build()

        return try {
            val response = client.newCall(request).execute()
            Result.success(response.isSuccessful)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    data class ChatMessage(
        val role: String,
        val content: String
    )

    fun updateModel(newModel: String) {
        // Model is read from prefs each time
    }
}