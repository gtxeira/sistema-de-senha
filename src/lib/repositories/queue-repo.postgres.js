import { prisma } from "../prisma-client.js";
import { normalizeCallType, formatNumberString } from "./utils.js";
import { MAX_QUEUE_NUMBER, MIN_QUEUE_NUMBER, LOCALE, DEFAULT_RECENT_LIMIT } from "../constants.js";

/**
 * Format time for display (HH:mm)
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export class QueueRepository {
  /**
   * Get next number for sector and type (normal/preferencial)
   * Uses atomic transaction with upsert + wraparound at 1000.
   * @param {'farmacia'|'recepcao'} sector
   * @param {'normal'|'preferencial'} type
   * @returns {Promise<number>}
   */
  async nextNumber(sector, type) {
    const { sequenceType } = normalizeCallType(type);

    const result = await prisma.$transaction(async (tx) => {
      // Upsert the sequence row, incrementing the counter atomically
      const seq = await tx.queue_sequences.upsert({
        where: {
          sector_id_call_type: {
            sector_id: sector,
            call_type: sequenceType,
          },
        },
        update: {
          current_number: { increment: 1 },
          updated_at: new Date(),
        },
        create: {
          sector_id: sector,
          call_type: sequenceType,
          current_number: 1,
        },
      });

      // Handle wraparound
      if (seq.current_number >= MAX_QUEUE_NUMBER + 1) {
        await tx.queue_sequences.update({
          where: {
            sector_id_call_type: {
              sector_id: sector,
              call_type: sequenceType,
            },
          },
          data: {
            current_number: 1,
            updated_at: new Date(),
          },
        });
        return 1;
      }

      return seq.current_number;
    });

    return result;
  }

  /**
   * Save a queue call
   * @param {{
   *   sector: 'farmacia'|'recepcao',
   *   number: number,
   *   numberStr: string,
   *   sequenceType: 'normal'|'preferencial',
   *   callType: 'normal'|'preferencial',
   *   attendantId: string|null
   * }} call
   * @returns {Promise<{id: string}>}
   */
  async saveCall(call) {
    const { sector, number, numberStr, sequenceType, attendantId } = call;

    // Validate attendantId format (UUID v1-v8)
    const callerId =
      attendantId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        attendantId,
      )
        ? attendantId
        : null;

    const created = await prisma.queue_calls.create({
      data: {
        sector_id: sector,
        type: sequenceType,
        number_int: number,
        number_str: numberStr,
        called_by: callerId,
      },
    });

    return { id: String(created.id) };
  }

  /**
   * Reset sequence for sector
   * @param {'farmacia'|'recepcao'} sector
   * @returns {Promise<void>}
   */
  async resetSector(sector) {
    await prisma.queue_sequences.updateMany({
      where: {
        sector_id: sector,
      },
      data: {
        current_number: 0,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Set next number for sector and type (sync/reset to specific value)
   * The next call to nextNumber() will return this value.
   * @param {'farmacia'|'recepcao'} sector
   * @param {'normal'|'preferencial'} type
   * @param {number} nextNumber - The next number to return (1-999)
   * @returns {Promise<void>}
   */
  async setNextNumber(sector, type, nextNumber) {
    const { sequenceType } = normalizeCallType(type);
    const num = Number(nextNumber);

    if (!Number.isInteger(num) || num < MIN_QUEUE_NUMBER || num > MAX_QUEUE_NUMBER) {
      throw new Error(`Número inválido. Use um valor entre ${MIN_QUEUE_NUMBER} e ${MAX_QUEUE_NUMBER}.`);
    }

    // Store nextNumber - 1 because nextNumber() increments before returning
    const currentNumber = num - 1;

    await prisma.queue_sequences.upsert({
      where: {
        sector_id_call_type: {
          sector_id: sector,
          call_type: sequenceType,
        },
      },
      update: {
        current_number: currentNumber,
        updated_at: new Date(),
      },
      create: {
        sector_id: sector,
        call_type: sequenceType,
        current_number: currentNumber,
      },
    });
  }

  /**
   * Get recent calls for a sector (for monitor history)
   * @param {'farmacia'|'recepcao'} sector
   * @param {number} limit
   * @returns {Promise<Array<{
   *   id: string,
   *   number: number,
   *   type: string,
   *   time: string
   * }>>}
   */
  async getRecentCalls(sector, limit = DEFAULT_RECENT_LIMIT) {
    try {
      const calls = await prisma.queue_calls.findMany({
        where: {
          sector_id: sector,
        },
        orderBy: {
          created_at: "desc",
        },
        take: limit,
        select: {
          id: true,
          number_int: true,
          type: true,
          created_at: true,
        },
      });

      return calls.map((call) => ({
        id: String(call.id),
        number: call.number_int,
        type:
          call.type === "preferential" || call.type === "preferencial"
            ? "preferencial"
            : "normal",
        time: formatTime(new Date(call.created_at || Date.now())),
      }));
    } catch {
      return [];
    }
  }
}
