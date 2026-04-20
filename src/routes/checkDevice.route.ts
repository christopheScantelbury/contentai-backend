import { Router } from 'express';
import { checkDeviceController } from '../controllers/checkDevice.controller';

const router = Router();

router.post('/auth/check-device', checkDeviceController);

export default router;
