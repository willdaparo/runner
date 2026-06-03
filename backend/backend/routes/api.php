<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\TerritoryController;
use App\Http\Controllers\Api\DashboardController;


Route::prefix('auth')->group(function () {
    Route::post('/register',       [AuthController::class, 'register']);
    Route::post('/login',          [AuthController::class, 'login']);
    Route::post('/forgot-password',[AuthController::class, 'forgotPassword']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me',      [AuthController::class, 'me']);
    });
});

// Requieren autenticación
Route::middleware('auth:sanctum')->group(function () {

    // Conquistar territorio al cerrar polígono
    Route::post('/sessions/{session}/conquer', [TerritoryController::class, 'conquer']);

});

// Pública — cualquiera puede ver el mapa
Route::get('/territories', [TerritoryController::class, 'index']);

Route::prefix('sessions')->group(function () {

    // Crear nueva sesión
    Route::post('/', [SessionController::class, 'store']);

    // Ver detalle de una sesión
    Route::get('/{session}', [SessionController::class, 'show']);

    // Enviar lote de puntos GPS
    Route::post('/{session}/points', [SessionController::class, 'storePoints']);

    // Cerrar sesión
    Route::patch('/{session}/finish', [SessionController::class, 'finish']);

});


 
// Agrega esto a routes/api.php
 
// Pública para ver el ranking, auth opcional para ver mis stats
Route::get('/dashboard/stats', [DashboardController::class, 'index'])->middleware('auth:sanctum')->withoutMiddleware('auth:sanctum');
 
// O si prefieres separarlo:
// Route::get('/dashboard/stats', [DashboardController::class, 'index']);