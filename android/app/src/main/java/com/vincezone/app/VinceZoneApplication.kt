package com.vincezone.app

import android.app.Application
import android.content.Context
import androidx.room.Room
import com.vincezone.app.data.ChatDatabase
import com.vincezone.app.data.ChatDao
import com.vincezone.app.network.VinceZoneClient
import com.vincezone.app.utils.PreferencesManager

class VinceZoneApplication : Application() {

    companion object {
        private var instance: VinceZoneApplication? = null
        lateinit var chatDatabase: ChatDatabase
        lateinit var chatDao: ChatDao
        lateinit var vinceZoneClient: VinceZoneClient
        lateinit var preferencesManager: PreferencesManager

        fun getInstance(): VinceZoneApplication {
            return instance!!
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize Room database
        chatDatabase = Room.databaseBuilder(
            this,
            ChatDatabase::class.java,
            "vincezone_chat.db"
        ).fallbackToDestructiveMigration()
            .build()

        chatDao = chatDatabase.chatDao()

        // Initialize preferences
        preferencesManager = PreferencesManager(this)

        // Initialize API client
        vinceZoneClient = VinceZoneClient(preferencesManager)
    }

    fun getChatDao(): ChatDao = chatDao

    fun getVinceZoneClient(): VinceZoneClient = vinceZoneClient

    fun getPreferencesManager(): PreferencesManager = preferencesManager
}