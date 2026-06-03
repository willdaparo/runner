import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth'; // Apunta directo a tu auth.ts
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatButtonModule, RouterLink],
  templateUrl: './login.html', // Sin el .component
  styleUrls: ['./login.css']    // Sin el .component
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  errorMessage: string | undefined;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;
    this.authService.login(this.loginForm.value).subscribe({
      next: (res: any) => {
        localStorage.setItem('token', res.token); // Guardamos el token
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Error login', err);
        this.errorMessage = 'Credenciales inválidas';
      }
    });
  }
}
