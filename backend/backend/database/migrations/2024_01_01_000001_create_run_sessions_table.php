<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Tabla de sesiones de carrera
        Schema::create('run_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('status', ['active', 'paused', 'finished'])->default('active');
            $table->decimal('distance_km', 8, 4)->default(0);
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->json('polygon')->nullable(); // puntos del polígono cerrado
            $table->timestamps();
        });

        // Tabla de puntos GPS
        Schema::create('gps_points', function (Blueprint $table) {
            $table->id();
            $table->uuid('session_id');
            $table->foreign('session_id')->references('id')->on('run_sessions')->cascadeOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->bigInteger('timestamp');
            $table->timestamps();

            $table->index('session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_points');
        Schema::dropIfExists('run_sessions');
    }
};
