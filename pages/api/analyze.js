import OpenAI from "openai";

export default async function handler(req, res) {
  console.log("API KEY:", process.env.OPENAI_API_KEY); // 👈 add here

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { analysis } = req.body;

    const prompt = `
You are a senior sales leader.

Analyze this pipeline:

${JSON.stringify(analysis)}

Give:
1. Executive summary (3 lines)
2. Biggest risk
3. Biggest opportunity
4. What to do today

Be sharp, specific, no fluff.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.status(200).json({
      summary: response.choices[0].message.content,
    });

  } catch (error) {
  console.error("🔥 OPENAI FULL ERROR:", error);
  res.status(500).json({ error: error.message });
}
}
