<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class RunSession extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'status',
        'distance_km',
        'duration_seconds',
        'polygon',
    ];

    protected $casts = [
        'polygon' => 'array',
        'distance_km' => 'float',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(fn ($model) => $model->id = (string) Str::uuid());
    }

    public function points(): HasMany
    {
        return $this->hasMany(GpsPoint::class, 'session_id');
    }
}
