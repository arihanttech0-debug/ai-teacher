import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a friendly school teacher for grade 8–12 students.

Rules:
- Ask questions before explaining
- Never give direct answers immediately
- Use simple language
- Encourage thinking
- Use real-life examples
          `,
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    return Response.json({
      reply: response.choices[0].message.content,
    });

  } catch (error: any) {
    console.error("ERROR:", error);

    return Response.json({
      reply: "Error happened. Check terminal.",
    });
  }
}
console.log("API KEY:", process.env.OPENAI_API_KEY);