<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GpsPoint;
use App\Models\RunSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SessionController extends Controller
{
    /**
     * POST /api/sessions
     * Crea una nueva sesión de carrera
     */
    public function store(Request $request): JsonResponse
    {
        $session = RunSession::create([
            'user_id' => $request->user()?->id, // null si no hay auth aún
            'status'  => 'active',
        ]);

        return response()->json([
            'session_id' => $session->id,
            'status'     => $session->status,
            'created_at' => $session->created_at,
        ], 201);
    }

    /**
     * POST /api/sessions/{session}/points
     * Recibe un lote de puntos GPS
     */
    public function storePoints(Request $request, string $sessionId): JsonResponse
    {
        $session = RunSession::findOrFail($sessionId);

        if ($session->status === 'finished') {
            return response()->json(['error' => 'La sesión ya está finalizada.'], 422);
        }

        $validator = Validator::make($request->all(), [
            'points'            => 'required|array|min:1',
            'points.*.lat'      => 'required|numeric|between:-90,90',
            'points.*.lng'      => 'required|numeric|between:-180,180',
            'points.*.timestamp'=> 'required|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $points = collect($request->points)->map(fn ($p) => [
            'session_id' => $session->id,
            'lat'        => $p['lat'],
            'lng'        => $p['lng'],
            'timestamp'  => $p['timestamp'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        GpsPoint::insert($points->toArray());

        // Actualiza distancia acumulada
        $session->increment('distance_km', $this->_calculateBatchDistance($request->points));

        return response()->json([
            'saved'      => $points->count(),
            'session_id' => $session->id,
        ]);
    }

    /**
     * PATCH /api/sessions/{session}/finish
     * Cierra la sesión y guarda el polígono
     */
    public function finish(Request $request, string $sessionId): JsonResponse
    {
        $session = RunSession::with('points')->findOrFail($sessionId);

        if ($session->status === 'finished') {
             return response()->json([
            'session_id'       => $session->id,
            'status'           => 'finished',
            'distance_km'      => round($session->distance_km, 3),
            'duration_seconds' => $session->duration_seconds,
        ]);
        }

        // Calcula duración total
        $firstPoint = $session->points()->orderBy('timestamp')->first();
        $lastPoint  = $session->points()->orderByDesc('timestamp')->first();
        $duration   = $firstPoint && $lastPoint
            ? (int) round(($lastPoint->timestamp - $firstPoint->timestamp) / 1000)
            : 0;

        // Construye el polígono con todos los puntos
        $polygon = $session->points()
            ->orderBy('timestamp')
            ->get(['lat', 'lng'])
            ->map(fn ($p) => ['lat' => (float) $p->lat, 'lng' => (float) $p->lng])
            ->toArray();

        $session->update([
            'status'           => 'finished',
            'duration_seconds' => $duration,
            'polygon'          => $polygon,
        ]);

        return response()->json([
            'session_id'       => $session->id,
            'status'           => 'finished',
            'distance_km'      => round($session->distance_km, 3),
            'duration_seconds' => $duration,
            'point_count'      => count($polygon),
        ]);
    }

    /**
     * GET /api/sessions/{session}
     * Detalle de una sesión con sus puntos
     */
    public function show(string $sessionId): JsonResponse
    {
        $session = RunSession::with('points')->findOrFail($sessionId);

        return response()->json([
            'id'               => $session->id,
            'status'           => $session->status,
            'distance_km'      => $session->distance_km,
            'duration_seconds' => $session->duration_seconds,
            'polygon'          => $session->polygon,
            'point_count'      => $session->points->count(),
            'created_at'       => $session->created_at,
        ]);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private function _calculateBatchDistance(array $points): float
    {
        $total = 0.0;
        for ($i = 1; $i < count($points); $i++) {
            $total += $this->_haversine($points[$i - 1], $points[$i]);
        }
        return round($total / 1000, 4); // metros → km
    }

    private function _haversine(array $a, array $b): float
    {
        $R    = 6371000;
        $dLat = deg2rad($b['lat'] - $a['lat']);
        $dLng = deg2rad($b['lng'] - $a['lng']);
        $s    = sin($dLat / 2) ** 2
              + cos(deg2rad($a['lat'])) * cos(deg2rad($b['lat'])) * sin($dLng / 2) ** 2;
        return $R * 2 * atan2(sqrt($s), sqrt(1 - $s));
    }
}
