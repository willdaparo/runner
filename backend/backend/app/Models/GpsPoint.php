<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GpsPoint extends Model
{
    protected $fillable = ['session_id', 'lat', 'lng', 'timestamp'];

    public function session(): BelongsTo
    {
        return $this->belongsTo(RunSession::class, 'session_id');
    }
}
