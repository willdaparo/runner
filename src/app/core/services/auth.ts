import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8000/api/auth';

  constructor(private http: HttpClient) {}

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  login(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, data).pipe(
      tap((response: any) => {
        localStorage.setItem('token', response.token);
      })
    );
  }

   loginc(credentials: any) {
    return this.http.post(`${this.apiUrl}/login`, credentials);
  }



  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {});
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
    return !!localStorage.getItem('token');
  }

  removeToken(): void {
    localStorage.removeItem('token');
  }
}