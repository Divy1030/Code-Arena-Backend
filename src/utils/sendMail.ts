import nodemailer from 'nodemailer';
import { html } from '../templates/mail/otpMailTemplet.js'; // Add .js extension for ES modules
import dotenv from 'dotenv';

dotenv.config();

// Validate environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER or EMAIL_PASS environment variables are not set');
}

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    debug: true, // Enable debug output
    logger: true, // Log to console
});

// Function to send OTP email
export async function sendOtpEmail(to: string, otp: string): Promise<void> {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: 'Your OTP Verification Code',
        text: `Your OTP code is: ${otp}`,
        html: html(otp),
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('OTP Email sent: ', info.response);
    } catch (error) {
        console.log('EMAIL_USER:', process.env.EMAIL_USER);
        console.log('EMAIL_PASS:', process.env.EMAIL_PASS);
        console.error('Error sending OTP email: ', error);
        throw error;
    }
}