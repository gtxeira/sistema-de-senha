import { NextResponse } from "next/server";
import { news } from "@/lib/repositories";

/* ─────────────────────────────────────────────────
   GET — lista notícias ativas
───────────────────────────────────────────────── */
export async function GET(request) {
  try {
    const newsList = await news.listActive();
    return NextResponse.json({ news: newsList });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao carregar notícias" },
      { status: err.status || 500 }
    );
  }
}

/* ─────────────────────────────────────────────────
   POST — cria nova notícia (upload + banco)
───────────────────────────────────────────────── */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const title = formData.get("title");
    const image = formData.get("image");

    if (!title || !image) {
      return NextResponse.json(
        { error: "Título e imagem são obrigatórios" },
        { status: 400 }
      );
    }

    const result = await news.create({ title, image });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao salvar notícia" },
      { status: err.status || 500 }
    );
  }
}

/* ─────────────────────────────────────────────────
   DELETE — remove notícia (soft delete + storage)
───────────────────────────────────────────────── */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID da notícia é obrigatório" },
        { status: 400 }
      );
    }

    await news.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Erro ao excluir notícia" },
      { status: err.status || 500 }
    );
  }
}