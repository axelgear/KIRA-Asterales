import nodemailer from 'nodemailer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmailTemplate from './EmailTemplate.js';
import { ENV } from '../config/environment.js';

type EmailBody =
	| { text: string; html?: string }
	| { text?: string; html: string }
	| { text: string; html: string };

export interface EmailTemplateParams {
	mailHeading: string;
	mailText: string;
	verificationCode: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const bannerPath = resolve(__dirname, '../assets/images/banner.png');

const DEFAULT_SENDER =
	ENV.SMTP_USER_NAME && ENV.SMTP_USER_NAME.includes('@')
		? `MTLBooks <${ENV.SMTP_USER_NAME}>`
		: ENV.SMTP_USER_NAME;

function ensureSmtpConfiguration(): void {
	if (!ENV.SMTP_ENDPOINT) {
		throw new Error('SMTP endpoint is not configured (SMTP_ENDPOINT)');
	}
	if (!ENV.SMTP_PORT) {
		throw new Error('SMTP port is not configured (SMTP_PORT)');
	}
	if (!ENV.SMTP_USER_NAME) {
		throw new Error('SMTP user name is not configured (SMTP_USER_NAME)');
	}
	if (!ENV.SMTP_PASSWORD) {
		throw new Error('SMTP password is not configured (SMTP_PASSWORD)');
	}
}

export function renderEmailTemplate(params: EmailTemplateParams): string {
	let html = EmailTemplate;
	const replacements: Record<keyof EmailTemplateParams, string> = {
		mailHeading: params.mailHeading,
		mailText: params.mailText.replace(/\n/g, '<br>'),
		verificationCode: params.verificationCode,
	};

	for (const [key, value] of Object.entries(replacements)) {
		html = html.replaceAll(`{{${key}}}`, value);
	}
	return html;
}

export async function sendMail(to: string, title: string, body: EmailBody) {
	if (!to) throw new Error('Recipient email is required');
	if (!title) throw new Error('Email subject is required');
	if (!body.text && !body.html) throw new Error('Email body requires text or html content');

	ensureSmtpConfiguration();

	const transporter = nodemailer.createTransport({
		host: ENV.SMTP_ENDPOINT,
		port: ENV.SMTP_PORT,
		secure: ENV.SMTP_PORT === 465,
		auth: {
			user: ENV.SMTP_USER_NAME,
			pass: ENV.SMTP_PASSWORD,
		},
		tls: {
			rejectUnauthorized: false,
		},
	});

	const mailOptions = {
		from: DEFAULT_SENDER,
		to,
		subject: title,
		text: body.text,
		html: body.html,
		attachments: [
			{
				filename: 'banner.png',
				path: bannerPath,
				cid: 'banner',
			},
		],
	};

	const result = await transporter.sendMail(mailOptions);
	return {
		success: Array.isArray(result.accepted) && result.accepted.length > 0,
		result,
		messageId: result.messageId,
	};
}

