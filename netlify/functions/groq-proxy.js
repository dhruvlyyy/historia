
// This function acts as a secure middleman.
// It receives the conversation from the app, adds your secret API key,
// and then forwards the request to the Groq API.

exports.handler = async function(event) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Your Groq API key is securely accessed from Netlify's environment variables
        const groqApiKey = process.env.GROQ_API_KEY;
        const body = JSON.parse(event.body);

        const response = await fetch('[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body) // Pass the body received from the frontend
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Groq API Error:', errorBody);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: 'Failed to fetch from Groq API', details: errorBody })
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Proxy Function Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error in the proxy function' })
        };
    }
};
