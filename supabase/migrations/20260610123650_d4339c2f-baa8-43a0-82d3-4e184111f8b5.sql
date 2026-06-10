-- Function to sync from sales to service_orders
CREATE OR REPLACE FUNCTION public.sync_sale_delivery_date_to_orders()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.service_orders
    SET expected_delivery_date = NEW.expected_delivery_date
    WHERE sale_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on sales table
DROP TRIGGER IF EXISTS tr_sync_sale_delivery_date ON public.sales;
CREATE TRIGGER tr_sync_sale_delivery_date
AFTER UPDATE OF expected_delivery_date ON public.sales
FOR EACH ROW
WHEN (OLD.expected_delivery_date IS DISTINCT FROM NEW.expected_delivery_date)
EXECUTE FUNCTION public.sync_sale_delivery_date_to_orders();

-- Function to sync from service_orders to sales
CREATE OR REPLACE FUNCTION public.sync_order_delivery_date_to_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_id IS NOT NULL THEN
        UPDATE public.sales
        SET expected_delivery_date = NEW.expected_delivery_date
        WHERE id = NEW.sale_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on service_orders table
DROP TRIGGER IF EXISTS tr_sync_order_delivery_date ON public.service_orders;
CREATE TRIGGER tr_sync_order_delivery_date
AFTER UPDATE OF expected_delivery_date ON public.service_orders
FOR EACH ROW
WHEN (OLD.expected_delivery_date IS DISTINCT FROM NEW.expected_delivery_date)
EXECUTE FUNCTION public.sync_order_delivery_date_to_sale();
