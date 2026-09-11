import { InMemoryRealtimeRepository } from "../../helpers/in-memory-repos/in-memory-realtime-repo.js";
import { realtimeRepoContract } from "../../contracts/realtime-repo.contract.js";

realtimeRepoContract(() => {
  const repo = new InMemoryRealtimeRepository();

  return {
    repo,
    emit: (sector, payload) => repo.emit(sector, payload),
  };
});
