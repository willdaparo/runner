import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

interface PlayerStat {
  rank: number;
  user_id: number;
  name: string;
  total_territories: number;
  total_area_ha: number;
  total_distance_km: number;
  total_duration_sec: number;
  total_sessions: number;
}

interface GlobalStat {
  total_players: number;
  total_sessions: number;
  total_area_ha: number;
  total_distance_km: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatButtonModule, RouterLink, MatFormFieldModule, MatInputModule, CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
})
export class Dashboard implements OnInit {
  private readonly API_URL = 'https://runner-frontend-production.up.railway.app';

  ranking: PlayerStat[] = [];
  myStats: PlayerStat | null = null;
  global: GlobalStat | null = null;
  loading = true;
  sortColumn: keyof PlayerStat = 'total_area_ha';
  sortAsc = false;

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit(): void {
     this.http.get<any>(`${this.API_URL}/dashboard/stats`).subscribe({
      next: (res) => {
        this.ranking = res.ranking;
        this.myStats = res.my_stats;
        this.global  = res.global;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  logout(): void {
    // 1. Eliminamos el token del almacenamiento local
    localStorage.removeItem('token');
    
    // 2. Redirigimos al componente de login
    this.router.navigate(['/login']);
  }

  goToMap(): void {
    this.router.navigate(['/map']);
  }

  sortBy(col: keyof PlayerStat): void {
    if (this.sortColumn === col) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortColumn = col;
      this.sortAsc = false;
    }
    this.ranking = [...this.ranking].sort((a, b) => {
      const va = a[col] as number;
      const vb = b[col] as number;
      return this.sortAsc ? va - vb : vb - va;
    });
  }

  formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  isMe(stat: PlayerStat): boolean {
    return this.myStats?.user_id === stat.user_id;
  }

  medalColor(rank: number): string {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#4b5563';
  }
}
