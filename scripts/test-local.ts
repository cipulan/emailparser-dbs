import PostalMime from 'postal-mime';
import * as fs from 'fs';
import * as path from 'path';
import { parseTransactionDetails, parseForwardedMail } from '../src/index';

async function test() {
    // Test with the newly available Forwarded email
    const emlPath = path.join(process.cwd(), 'Fwd_ Transaksi Kartu Kredit digibank Anda Berhasil.eml');

    if (!fs.existsSync(emlPath)) {
        console.error(`Error: Could not find email file at ${emlPath}`);
        process.exit(1);
    }

    console.log(`Reading email from: ${emlPath}`);
    const emlContent = fs.readFileSync(emlPath);

    const parser = new PostalMime();
    const email = await parser.parse(emlContent);

    console.log('Parsing content...');

    // Test Forwarded Headers
    const forwarded = parseForwardedMail(email.text || email.html || '');
    console.log('--- Forwarded Headers ---');
    console.log(JSON.stringify(forwarded, null, 2));

    // Test Transaction Details
    const extracted = parseTransactionDetails(email.html || email.text || '');

    console.log('--- Extracted Data ---');
    console.log(JSON.stringify(extracted, null, 2));
}

test().catch(console.error);
