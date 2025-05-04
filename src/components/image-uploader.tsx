"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
  setFile: (file: File | null) => void;
}

export function ImageUploader({ onImageUpload, imageUrl, setImageUrl, setFile }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setIsDragging(false);
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const reader = new FileReader();
        reader.onloadend = () => {
          setImageUrl(reader.result as string);
          setFile(file);
          onImageUpload(file);
        };
        reader.readAsDataURL(file);
      }
    },
    [onImageUpload, setImageUrl, setFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the dropzone click
    setImageUrl(null);
    setFile(null);
  };

  return (
    <Card className={cn("border-2 border-dashed hover:border-primary transition-colors", isDragging || isDragActive ? "border-primary bg-accent/10" : "")}>
      <CardContent
        {...getRootProps()}
        className={cn("relative flex flex-col items-center justify-center p-6 min-h-[200px] cursor-pointer text-center")}
      >
        <input {...getInputProps()} />
        {imageUrl ? (
          <>
            <Image
              src={imageUrl}
              alt="Uploaded Math Expression"
              width={400}
              height={200}
              className="max-h-[300px] w-auto object-contain rounded-md"
              data-ai-hint="math equation"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="absolute top-2 right-2 bg-background/80 hover:bg-destructive/80 hover:text-destructive-foreground rounded-full"
              aria-label="Clear image"
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">Drag 'n' drop a new image here, or click to replace</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <UploadCloud className="h-12 w-12" />
            <p className="font-semibold text-foreground">
              {isDragActive ? "Drop the image here..." : "Drag 'n' drop an image here, or click to select"}
            </p>
            <p className="text-xs">Supports JPG, PNG</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
