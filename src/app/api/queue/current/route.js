import { NextResponse } from "next/server";
import { getRealtimeClient } from "../../../../lib/supabase";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get("sector");
    
    if (!sector) {
      return NextResponse.json({ error: "Setor é obrigatório" }, { status: 400 });
    }

    const supabase = getRealtimeClient();
    if (!supabase) {
      return NextResponse.json({ current: null }, { status: 200 });
    }

    // Busca a última senha chamada deste setor
    const { data, error } = await supabase
      .from("queue_calls")
      .select("number_int, type, created_at")
      .eq("sector_id", sector)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Erro ao buscar senha atual:", error);
      return NextResponse.json({ current: null }, { status: 200 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ current: null }, { status: 200 });
    }

    const latest = data[0];
    return NextResponse.json({
      current: {
        number: latest.number_int,
        type: latest.type === "preferential" ? "preferencial" : "normal",
        createdAt: latest.created_at
      }
    });

  } catch (error) {
    console.error("Erro na API /queue/current:", error);
    return NextResponse.json({ current: null }, { status: 200 });
  }
}