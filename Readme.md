# CodeArena Backend

A scalable backend for CodeArena, a competitive coding platform. Built with Node.js, Express, TypeScript, MongoDB, and Socket.io. Supports user authentication, contest management, problem submissions, social features, and more.

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup & Installation](#setup--installation)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features
- User registration, login (OTP & Google), password management
- Contest creation, joining, and management
- Problem submission and evaluation
- Social features: follow, search, suggested users
- Real-time updates via Socket.io
- Email notifications (OTP, password reset)

---

## Tech Stack
- **Node.js**
- **Express**
- **TypeScript**
- **MongoDB (Mongoose)**
- **Socket.io**
- **Cloudinary** (file uploads)
- **Redis** (caching)
- **Multer** (file handling)
- **Nodemailer** (emails)

---

## Setup & Installation

1. **Clone the repository**
   ```sh
   git clone https://github.com/parikshit-jaiswal/Code-Arena-Backend.git
   cd Code-Arena-Backend
   ```
2. **Install dependencies**
   ```sh
   npm install
   ```
3. **Configure environment variables**
   - Copy `.env.example` to `.env` and fill in required values (MongoDB URI, JWT secret, Cloudinary, etc.)
4. **Run in development**
   ```sh
   npm run dev
   ```
5. **Build for production**
   ```sh
   npm run build
   npm start
   ```

---

## API Documentation

### User APIs (`/api/user`)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/register` | POST | Register new user | No |
| `/login` | POST | Login with password/OTP | No |
| `/v` | POST | Verify login OTP | No |
| `/forgot-password` | POST | Request password reset OTP | No |
| `/verify-reset-password-otp` | POST | Verify password reset OTP | No |
| `/update-password` | POST | Update password | No |
| `/google` | POST | Google login | No |
| `/logout` | POST | Logout user | Yes |
| `/refresh-token` | POST | Refresh JWT token | No |
| `/get-user-data` | GET | Get current user data | Yes |
| `/change-password` | POST | Change password | Yes |
| `/manageable-contests` | GET | Get contests manageable by user | Yes |
| `/profile-picture` | POST | Upload profile picture | Yes |
| `/current` | GET | Get current user data | Yes |
| `/:userId` | GET | Get user by ID | Yes |
| `/follow` | POST | Follow/unfollow user | Yes |
| `/search-friends` | POST | Search friends by name | Yes |
| `/suggested-users` | GET | Suggested users to follow | Yes |
| `/profile/:userId` | GET | Get profile of user | Yes |
| `/create-password` | POST | Create password for Google user | Yes |

### Contest APIs (`/api/contest`)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/join-contest/:contestId` | POST | Join a contest | Yes |
| `/getAllContests` | GET | Get all contests | Yes |
| `/getContestById/:contestId` | GET | Get contest by ID | Yes |
| `/create-contest` | POST | Create a new contest | Yes |

### Problem APIs (`/api/problem`)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/submit-solution/:contestId/:problemId` | POST | Submit solution to a problem | Yes |
| `/get-problem/:contestId/:problemId` | GET | Get problem details | Yes |

### Social APIs (`/api/social`)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/suggested-users` | GET | Get suggested users | Yes |
| `/search-users` | POST | Search users | Yes |
| `/follow` | POST | Follow/unfollow user | Yes |
| `/followers` | GET | Get followers | Yes |
| `/following` | GET | Get following | Yes |

### Test API (`/api/test`)
| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/` | GET | Test API health | No |

---

## Authentication
- Most endpoints require JWT authentication (see `Auth` column above).
- Use the `/login` or `/google` endpoints to obtain a token.
- Pass token in `Authorization: Bearer <token>` header.

---

## Contribution Guidelines
1. Fork the repo and create your branch.
2. Write clear, documented code and tests.
3. Submit a pull request with a detailed description.

---

## License
This project is licensed under the ISC License.
