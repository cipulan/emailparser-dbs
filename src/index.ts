import PostalMime from 'postal-mime';

interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

export default {
	async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
		const telegramBotToken = env.TELEGRAM_BOT_TOKEN;
		const telegramChatId = env.TELEGRAM_CHAT_ID;

		if (!telegramBotToken || !telegramChatId) {
			console.error('Missing Telegram configuration');
			return;
		}

		try {
			const parser = new PostalMime();
			const email = await parser.parse(message.raw);

			// Check for forwarded content
			const forwarded = parseForwardedMail(email.text || email.html || '');

			// Use original details if available, otherwise fall back to current email headers
			const subject = forwarded.subject || email.subject || '(No Subject)';
			const from = forwarded.from || (email.from ? `${email.from.name} <${email.from.address}>` : '(Unknown Sender)');
			const date = forwarded.date || '';

			// Extract transaction details if available
			const transactionDetails = parseTransactionDetails(email.html || email.text || '');

			let telegramMessage = `📧 *${from}*\n` +
				`*Subject:* ${escapeMarkdown(subject)}\n`;

			if (date) {
				telegramMessage += `*Date:* ${escapeMarkdown(date)}\n`;
			}

			telegramMessage += `\n` +
				`*Detail Transaksi:*\n` +
				`*4 digit Akhir Kartu:* ${escapeMarkdown(transactionDetails.akhirKartu)}\n` +
				`*Merchant/ATM:* ${escapeMarkdown(transactionDetails.merchant)}\n` +
				`*Tanggal Transaksi:* ${escapeMarkdown(transactionDetails.tanggalTransaksi)}\n` +
				`*Nominal:* ${escapeMarkdown(transactionDetails.nominal)}`;

			await sendToTelegram(telegramBotToken, telegramChatId, telegramMessage);

		} catch (error) {
			console.error('Error parsing email or sending to Telegram:', error);
			// Optional: send error notification to Telegram or log it
		}
	}
};

export function parseTransactionDetails(html: string): {
	akhirKartu: string,
	merchant: string,
	tanggalTransaksi: string,
	nominal: string
} {
	// Defaults
	let akhirKartu = 'N/A';
	let merchant = 'N/A';
	let tanggalTransaksi = 'N/A';
	let nominal = 'N/A';

	if (!html) return { akhirKartu, merchant, tanggalTransaksi, nominal };

	// Helper to clean extracted text
	const clean = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

	// 4 digit Akhir Kartu
	const kartuMatch = html.match(/4\s*digit\s*Akhir\s*Kartu\s*:\s*(?:&nbsp;)?\s*(\d{4})/i);
	if (kartuMatch && kartuMatch[1]) akhirKartu = clean(kartuMatch[1]);

	// Merchant/ATM
	// Capture text after Merchant/ATM: until the next block element or newline
	const merchantMatch = html.match(/Merchant\/ATM\s*:\s*(.*?)(?:<br|<\/p>|&nbsp;|\n)/i);
	if (merchantMatch && merchantMatch[1]) merchant = clean(merchantMatch[1]);

	// Tanggal Transaksi
	const tanggalMatch = html.match(/Tanggal\s*Transaksi\s*:\s*(.*?)(?:<br|<\/p>|&nbsp;|\n)/i);
	if (tanggalMatch && tanggalMatch[1]) tanggalTransaksi = clean(tanggalMatch[1]);

	// Nominal
	const nominalMatch = html.match(/Nominal\s*:\s*(.*?)(?:<br|<\/p>|&nbsp;|\n)/i);
	if (nominalMatch && nominalMatch[1]) nominal = clean(nominalMatch[1]);

	return { akhirKartu, merchant, tanggalTransaksi, nominal };
}

export function parseForwardedMail(content: string): { from?: string, subject?: string, date?: string } {
	let from, subject, date;

	// Normalize content to help with matching
	// Replace <br> with newlines
	const normalized = content.replace(/<br\s*\/?>/gi, '\n');

	// Regex for "From" / "Dari" in forwarded block
	const fromMatch = normalized.match(/(?:Dari|From):\s*(.*?)(?:\r?\n|$)/i);
	if (fromMatch && fromMatch[1]) {
		const rawFrom = fromMatch[1];
		// Try to extract email address first
		const emailMatch = rawFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
		if (emailMatch) {
			from = emailMatch[1];
		} else {
			// Fallback to cleaning tags if no email pattern found (unlikely for a valid from field)
			from = rawFrom.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			from = from.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
		}
	}

	// Regex for "Date" / "Tanggal"
	const dateMatch = normalized.match(/(?:Date|Tanggal|Sent):\s*(.*?)(?:\r?\n|$)/i);
	if (dateMatch && dateMatch[1]) {
		date = dateMatch[1].replace(/<[^>]*>/g, '').trim();
	}

	// Regex for "Subject"
	// Sometimes subject might be multiline or have extra noise, keeping it simple for now
	const subjectMatch = normalized.match(/Subject:\s*(.*?)(?:\r?\n|$)/i);
	if (subjectMatch && subjectMatch[1]) {
		subject = subjectMatch[1].replace(/<[^>]*>/g, '').trim();
	}

	return { from, subject, date };
}

async function sendToTelegram(token: string, chatId: string, text: string) {
	const url = `https://api.telegram.org/bot${token}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: text,
		parse_mode: 'Markdown'
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`Telegram API error: ${response.status} ${response.statusText} - ${errorText}`);
	}
}

function escapeMarkdown(text: string): string {
	if (!text) return '';
	// 'Markdown' (v1) supports *bold*, _italic_, [text](url), `code`, ```pre```
	// We should allow some marks if they are intended, but since we are wrapping values, 
	// it's safest to escape everything that could break the format headers.
	// However, for values like "RP. 10.000", * or _ are rare.
	return text.replace(/[_*`\[]/g, '\\$&');
}
