<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Territory extends Model
{
    protected $fillable = [
        'user_id',
        'session_id',
        'polygon',
        'area_m2',
    ];

    protected $casts = [
        'polygon' => 'array',
        'area_m2' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(RunSession::class, 'session_id');
    }
}
