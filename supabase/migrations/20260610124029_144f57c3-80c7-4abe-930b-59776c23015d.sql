CREATE OR REPLACE FUNCTION public.sync_sale_to_service_orders()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_name TEXT;
    v_service_name TEXT;
    v_new_title TEXT;
BEGIN
    -- Get customer name
    SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
    -- Get service type name
    SELECT name INTO v_service_name FROM public.service_types WHERE id = NEW.service_type_id;
    
    v_new_title := COALESCE(v_customer_name, 'Cliente') || ' - ' || COALESCE(v_service_name, 'Serviço');

    UPDATE public.service_orders
    SET 
        title = v_new_title,
        producer_id = NEW.producer_id,
        expected_delivery_date = NEW.expected_delivery_date,
        trello_link = NEW.trello_link
    WHERE sale_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger to handle more fields
DROP TRIGGER IF EXISTS tr_sync_sale_delivery_date ON public.sales;
CREATE TRIGGER tr_sync_sale_all_fields
AFTER UPDATE OF customer_id, service_type_id, producer_id, expected_delivery_date, trello_link ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_sale_to_service_orders();
