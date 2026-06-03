<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RunSession;
use App\Services\ConquestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TerritoryController extends Controller
{
    public function __construct(private ConquestService $conquest) {}

    /**
     * POST /api/sessions/{session}/conquer
     * Llama al cerrar el polígono — registra el territorio y procesa reconquistas
     */
    public function conquer(Request $request, string $sessionId): JsonResponse
    {
        $session = RunSession::findOrFail($sessionId);

        // Verifica que la sesión pertenece al usuario autenticado
        if ($session->user_id !== $request->user()->id) {
            return response()->json(['error' => 'No autorizado.'], 403);
        }

        if ($session->status !== 'finished') {
            return response()->json(['error' => 'La sesión debe estar finalizada.'], 422);
        }

        if (empty($session->polygon)) {
            return response()->json(['error' => 'La sesión no tiene polígono.'], 422);
        }

        $result = $this->conquest->process($session, $session->polygon);

        return response()->json([
            'message'     => 'Territorio conquistado.',
            'area_m2'     => $result['area_m2'],
            'reconquered' => $result['reconquered'],
        ], 201);
    }

    /**
     * GET /api/territories
     * Devuelve todos los territorios para pintar en el mapa
     */
    public function index(): JsonResponse
    {
        $territories = $this->conquest->getAllForMap();

        return response()->json([
            'territories' => $territories,
            'count'       => count($territories),
        ]);
    }
}
