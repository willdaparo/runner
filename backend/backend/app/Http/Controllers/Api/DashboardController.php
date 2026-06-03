<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RunSession;
use App\Models\Territory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * GET /api/dashboard/stats
     * Ranking global + stats del usuario autenticado
     */
    public function index(Request $request): JsonResponse
    {
        // ─── Ranking global ───────────────────────────────────────────────
        $ranking = User::select('users.id', 'users.name')
            ->leftJoin('territories', 'territories.user_id', '=', 'users.id')
            ->leftJoin('run_sessions', 'run_sessions.user_id', '=', 'users.id')
            ->groupBy('users.id', 'users.name')
            ->selectRaw('
                COUNT(DISTINCT territories.id)          AS total_territories,
                COALESCE(SUM(territories.area_m2), 0)   AS total_area_m2,
                COALESCE(SUM(run_sessions.distance_km), 0) AS total_distance_km,
                COALESCE(SUM(run_sessions.duration_seconds), 0) AS total_duration_seconds,
                COUNT(DISTINCT run_sessions.id)         AS total_sessions
            ')
            ->orderByDesc('total_area_m2')
            ->get()
            ->map(fn ($u, $i) => [
                'rank'                 => $i + 1,
                'user_id'             => $u->id,
                'name'                => $u->name,
                'total_territories'   => (int) $u->total_territories,
                'total_area_m2'       => round((float) $u->total_area_m2, 2),
                'total_area_ha'       => round((float) $u->total_area_m2 / 10000, 3),
                'total_distance_km'   => round((float) $u->total_distance_km, 2),
                'total_duration_sec'  => (int) $u->total_duration_seconds,
                'total_sessions'      => (int) $u->total_sessions,
            ]);

        // ─── Stats del usuario autenticado ────────────────────────────────
        $myStats = null;
        if ($request->user()) {
            $myStats = $ranking->firstWhere('user_id', $request->user()->id);
        }

        // ─── Stats globales del juego ─────────────────────────────────────
        $global = [
            'total_players'    => User::count(),
            'total_sessions'   => RunSession::where('status', 'finished')->count(),
            'total_area_ha'    => round(Territory::sum('area_m2') / 10000, 2),
            'total_distance_km'=> round(RunSession::sum('distance_km'), 2),
        ];

        return response()->json([
            'ranking' => $ranking->values(),
            'my_stats' => $myStats,
            'global'  => $global,
        ]);
    }
}
