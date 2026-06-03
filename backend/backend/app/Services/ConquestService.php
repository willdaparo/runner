<?php

namespace App\Services;

use App\Models\Territory;
use App\Models\RunSession;
use Illuminate\Support\Facades\DB;

class ConquestService
{
    /**
     * Procesa la conquista al cerrar un polígono.
     * Detecta intersecciones con territorios ajenos y reconquista.
     *
     * @param  RunSession $session   Sesión que acaba de terminar
     * @param  array      $polygon   Array de ['lat' => float, 'lng' => float]
     * @return array                 Resultado con territorio creado y reconquistas
     */
    public function process(RunSession $session, array $polygon): array
    {
        $userId  = $session->user_id;
        $area    = $this->_polygonArea($polygon);

        // Territorios de OTROS usuarios que intersectan con el nuevo polígono
        $rivals = Territory::where('user_id', '!=', $userId)->get();

        $reconquered = [];

        DB::transaction(function () use ($session, $userId, $polygon, $area, $rivals, &$reconquered) {

            foreach ($rivals as $rival) {
                if ($this->_polygonsIntersect($polygon, $rival->polygon)) {
                    // Calcula la parte que queda para el rival (sustrae el nuevo polígono)
                    $remaining = $this->_subtractPolygon($rival->polygon, $polygon);

                    if (empty($remaining)) {
                        // El nuevo polígono cubre todo el territorio rival → eliminarlo
                        $reconquered[] = [
                            'territory_id' => $rival->id,
                            'rival_user_id' => $rival->user_id,
                            'action' => 'deleted',
                        ];
                        $rival->delete();
                    } else {
                        // Recorta el territorio rival
                        $reconquered[] = [
                            'territory_id' => $rival->id,
                            'rival_user_id' => $rival->user_id,
                            'action' => 'trimmed',
                            'remaining_points' => count($remaining),
                        ];
                        $rival->update([
                            'polygon' => $remaining,
                            'area_m2' => $this->_polygonArea($remaining),
                        ]);
                    }
                }
            }

            // Elimina territorios previos del mismo usuario en esa sesión (evita duplicados)
            Territory::where('session_id', $session->id)->delete();

            // Crea el nuevo territorio
            Territory::create([
                'user_id'    => $userId,
                'session_id' => $session->id,
                'polygon'    => $polygon,
                'area_m2'    => $area,
            ]);
        });

        return [
            'area_m2'     => round($area, 2),
            'reconquered' => $reconquered,
        ];
    }

    /**
     * Devuelve todos los territorios para pintar en el mapa.
     * Incluye color por usuario (basado en user_id).
     */
    public function getAllForMap(): array
    {
        return Territory::with('user:id,name')
            ->get()
            ->map(fn ($t) => [
                'id'      => $t->id,
                'user_id' => $t->user_id,
                'name'    => $t->user->name ?? 'Anónimo',
                'color'   => $this->_userColor($t->user_id),
                'polygon' => $t->polygon,
                'area_m2' => $t->area_m2,
            ])
            ->toArray();
    }

    // ─── Geometría ────────────────────────────────────────────────────────────

    /**
     * Detección de intersección usando Separating Axis Theorem (SAT) simplificado.
     * Para polígonos GPS en coordenadas pequeñas es suficientemente preciso.
     */
    private function _polygonsIntersect(array $polyA, array $polyB): bool
    {
        // Bounding box rápido primero (evita cálculo costoso)
        if (!$this->_boundingBoxOverlap($polyA, $polyB)) {
            return false;
        }

        // Punto de A dentro de B o punto de B dentro de A
        foreach ($polyA as $point) {
            if ($this->_pointInPolygon($point, $polyB)) return true;
        }
        foreach ($polyB as $point) {
            if ($this->_pointInPolygon($point, $polyA)) return true;
        }

        // Intersección de aristas
        return $this->_edgesIntersect($polyA, $polyB);
    }

    /**
     * Ray casting algorithm — punto dentro de polígono
     */
    private function _pointInPolygon(array $point, array $polygon): bool
    {
        $x = $point['lng'];
        $y = $point['lat'];
        $n = count($polygon);
        $inside = false;

        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            $xi = $polygon[$i]['lng']; $yi = $polygon[$i]['lat'];
            $xj = $polygon[$j]['lng']; $yj = $polygon[$j]['lat'];

            if ((($yi > $y) !== ($yj > $y)) &&
                ($x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi)) {
                $inside = !$inside;
            }
        }

        return $inside;
    }

    /**
     * Verifica si alguna arista de A intersecta con alguna de B
     */
    private function _edgesIntersect(array $polyA, array $polyB): bool
    {
        $nA = count($polyA);
        $nB = count($polyB);

        for ($i = 0; $i < $nA; $i++) {
            $a1 = $polyA[$i];
            $a2 = $polyA[($i + 1) % $nA];

            for ($j = 0; $j < $nB; $j++) {
                $b1 = $polyB[$j];
                $b2 = $polyB[($j + 1) % $nB];

                if ($this->_segmentsIntersect($a1, $a2, $b1, $b2)) {
                    return true;
                }
            }
        }
        return false;
    }

    private function _segmentsIntersect(array $p1, array $p2, array $p3, array $p4): bool
    {
        $d1 = $this->_cross($p3, $p4, $p1);
        $d2 = $this->_cross($p3, $p4, $p2);
        $d3 = $this->_cross($p1, $p2, $p3);
        $d4 = $this->_cross($p1, $p2, $p4);

        if ((($d1 > 0 && $d2 < 0) || ($d1 < 0 && $d2 > 0)) &&
            (($d3 > 0 && $d4 < 0) || ($d3 < 0 && $d4 > 0))) {
            return true;
        }
        return false;
    }

    private function _cross(array $o, array $a, array $b): float
    {
        return ($a['lng'] - $o['lng']) * ($b['lat'] - $o['lat'])
             - ($a['lat'] - $o['lat']) * ($b['lng'] - $o['lng']);
    }

    private function _boundingBoxOverlap(array $polyA, array $polyB): bool
    {
        $latsA = array_column($polyA, 'lat');
        $lngsA = array_column($polyA, 'lng');
        $latsB = array_column($polyB, 'lat');
        $lngsB = array_column($polyB, 'lng');

        return !(min($latsA) > max($latsB) || max($latsA) < min($latsB) ||
                 min($lngsA) > max($lngsB) || max($lngsA) < min($lngsB));
    }

    /**
     * Sustracción simplificada: devuelve los puntos del polígono rival
     * que quedan FUERA del nuevo polígono.
     * Para una implementación completa se recomienda usar la librería polyclip.
     */
    private function _subtractPolygon(array $subject, array $clip): array
    {
        return array_values(array_filter(
            $subject,
            fn ($point) => !$this->_pointInPolygon($point, $clip)
        ));
    }

    /**
     * Área del polígono con la fórmula de Shoelace (en metros cuadrados aprox.)
     */
    private function _polygonArea(array $polygon): float
    {
        $n = count($polygon);
        if ($n < 3) return 0.0;

        $area = 0.0;
        $R    = 6371000; // radio de la Tierra en metros
        $toRad = fn($d) => $d * M_PI / 180;

        for ($i = 0; $i < $n; $i++) {
            $j    = ($i + 1) % $n;
            $xi   = $toRad($polygon[$i]['lng']) * cos($toRad($polygon[$i]['lat'])) * $R;
            $yi   = $toRad($polygon[$i]['lat']) * $R;
            $xj   = $toRad($polygon[$j]['lng']) * cos($toRad($polygon[$j]['lat'])) * $R;
            $yj   = $toRad($polygon[$j]['lat']) * $R;
            $area += $xi * $yj - $xj * $yi;
        }

        return abs($area) / 2.0;
    }

    /**
     * Color determinista por user_id (mismo usuario = mismo color siempre)
     */
    private function _userColor(int $userId): string
    {
        $colors = [
            '#00f5a0', // verde neón
            '#ff6b35', // naranja
            '#a855f7', // púrpura
            '#38bdf8', // azul cielo
            '#f59e0b', // ámbar
            '#ec4899', // rosa
            '#ef4444', // rojo
            '#10b981', // esmeralda
        ];
        return $colors[$userId % count($colors)];
    }
}
