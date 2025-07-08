-- Create the recap table
CREATE TABLE public.recap (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    show_id UUID REFERENCES public.show(id) ON DELETE CASCADE NOT NULL,
    season_id UUID REFERENCES public.season(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'draft'::text NOT NULL,
    CONSTRAINT unique_recap_per_user_season UNIQUE (user_id, season_id)
);

-- Create the slide table
CREATE TABLE public.slide (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    recap_id UUID REFERENCES public.recap(id) ON DELETE CASCADE NOT NULL,
    "order" INTEGER NOT NULL,
    canvas_data JSONB
);

-- Enable Row Level Security for the tables
ALTER TABLE public.recap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slide ENABLE ROW LEVEL SECURITY;

-- Create policies for the recap table
CREATE POLICY "Users can view their own recaps." ON public.recap FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recaps." ON public.recap FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own recaps." ON public.recap FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recaps." ON public.recap FOR DELETE USING (auth.uid() = user_id);

-- Create policies for the slide table
CREATE POLICY "Users can view slides for recaps they own." ON public.slide FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.recap
        WHERE recap.id = slide.recap_id AND recap.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert slides for recaps they own." ON public.slide FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.recap
        WHERE recap.id = slide.recap_id AND recap.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update slides for recaps they own." ON public.slide FOR UPDATE USING (
    EXISTS (
        SELECT 1
        FROM public.recap
        WHERE recap.id = slide.recap_id AND recap.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete slides for recaps they own." ON public.slide FOR DELETE USING (
    EXISTS (
        SELECT 1
        FROM public.recap
        WHERE recap.id = slide.recap_id AND recap.user_id = auth.uid()
    )
);
