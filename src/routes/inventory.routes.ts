import { Router } from 'express';
import { authenticate, injectBusiness } from '../middleware/auth';
import * as ctrl from '../controllers/inventory.controller';

const router = Router();
router.use(authenticate, injectBusiness);

// Products
router.get('/products', ctrl.getProducts);
router.post('/products', ctrl.createProductValidators, ctrl.createProduct);
router.get('/products/:id', ctrl.getProduct);
router.put('/products/:id', ctrl.updateProduct);
router.delete('/products/:id', ctrl.deleteProduct);
router.post('/products/:id/adjust-stock', ctrl.adjustStock);

// Categories
router.get('/categories', ctrl.getCategories);
router.post('/categories', ctrl.createCategory);

// Suppliers
router.get('/suppliers', ctrl.getSuppliers);
router.post('/suppliers', ctrl.createSupplier);
router.put('/suppliers/:id', ctrl.updateSupplier);

export default router;
