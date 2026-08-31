import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { config } from '../../config/index.js';

export class AuthController {
  constructor(private authService: AuthService) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    const result = await this.authService.register(email, password, name);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: config.refreshTokenCookieMaxAge,
      path: '/api/auth',
    });
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const result = await this.authService.login(email, password);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: config.refreshTokenCookieMaxAge,
      path: '/api/auth',
    });
    res.json({ accessToken: result.accessToken, user: result.user });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    const result = await this.authService.refresh(refreshToken);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: config.refreshTokenCookieMaxAge,
      path: '/api/auth',
    });
    res.json({ accessToken: result.accessToken });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    await this.authService.logout(refreshToken);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Выход выполнен' });
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId!;
    const result = await this.authService.getMe(userId);
    res.json(result);
  });
}