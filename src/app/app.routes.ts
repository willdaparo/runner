import { Routes } from '@angular/router';
import { LoginComponent } from './core/auth/components/login/login';
import { authGuard } from './auth.guard';
import { MapComponent } from './map/map';
import { RegisterComponent } from './core/auth/components/register/register';

export const routes: Routes = [
  // Redirección inicial: al abrir la app, ve al login
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  
  { path: 'login', component: LoginComponent },
  
  // Ruta de registro
  { path: 'register', loadComponent: () => import('./core/auth/components/register/register').then(m => m.RegisterComponent) },
  
  // Ruta protegida: si no hay sesión, el guard mandará a /register
  { 
    path: 'dashboard', 
    loadComponent: () => import('../app/feature/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [authGuard] 
  },
  //prueba de ruta mapa
  {path: 'mapa', component: MapComponent} ,
  {path: 'registro', component: RegisterComponent} 
];