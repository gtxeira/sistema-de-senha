import { queueRepoContract } from '../../contracts/queue-repo.contract';
import { InMemoryQueueRepository } from '../../helpers/in-memory-repos/in-memory-queue-repo';

queueRepoContract(() => new InMemoryQueueRepository());
