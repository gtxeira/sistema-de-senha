import { NextResponse } from 'next/server';

import { requirePermission, requireSession } from '@/server/http/api-auth';
import {
  createNews,
  listNews,
  removeNews,
} from '@/server/services/news-service';
import { errorMessage, errorStatus } from '@/shared/errors';
import { NEWS_CREATE, NEWS_DELETE } from '@/shared/permissions';

/* ─────────────────────────────────────────────────
   GET — lista notícias ativas
   Usado pelo admin e pelos monitores (ambos autenticados).
───────────────────────────────────────────────── */
export async function GET() {
  try {
    const { error } = await requireSession();
    if (error) return error;

    const newsList = await listNews();
    return NextResponse.json({ news: newsList });
  } catch {
    return NextResponse.json(
      { error: 'Erro ao carregar notícias' },
      { status: 500 },
    );
  }
}

/* ─────────────────────────────────────────────────
   POST — cria nova notícia (upload + banco)
   Exige a permissão `noticias.criar`: o texto e a imagem aparecem nos
   monitores.
───────────────────────────────────────────────── */
export async function POST(request: Request) {
  try {
    const { error } = await requirePermission(NEWS_CREATE);
    if (error) return error;

    const formData = await request.formData();
    const title = formData.get('title');
    const image = formData.get('image');

    // `FormData.get` devolve `string | File | null`; o título é sempre uma
    // parte de texto, então o `typeof` rejeita multipart malformado em vez
    // de deixar um `File` chegar até o insert.
    if (typeof title !== 'string' || !title || !image) {
      return NextResponse.json(
        { error: 'Título e imagem são obrigatórios' },
        { status: 400 },
      );
    }

    const result = await createNews({ title, image });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao salvar notícia') },
      { status: errorStatus(error, 500) },
    );
  }
}

/* ─────────────────────────────────────────────────
   DELETE — remove notícia (soft delete + storage)
   Exige a permissão `noticias.excluir`.
───────────────────────────────────────────────── */
export async function DELETE(request: Request) {
  try {
    const { error } = await requirePermission(NEWS_DELETE);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID da notícia é obrigatório' },
        { status: 400 },
      );
    }

    await removeNews(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, 'Erro ao excluir notícia') },
      { status: errorStatus(error, 500) },
    );
  }
}
