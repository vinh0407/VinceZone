package com.vincezone.app.data

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromTimestamp(value: Long?): Long = value ?: 0L

    @TypeConverter
    fun toTimestamp(value: Long?): Long = value ?: 0L
}